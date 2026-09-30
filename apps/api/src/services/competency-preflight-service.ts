import { McpClientManager, unresolvedCompetencyParticipation, type CompetencyExecutionSnapshot, type CompetencyParticipation, type RunRepository } from "@moodle-agent-poc/agent-runtime";
import { z } from "zod";
import type { AppConfig } from "../config/config-loader.js";
import { assertInstructionalDesignMutationState } from "./instructional-design-run-lifecycle-service.js";

const readinessSchema = z.object({
  status: z.enum(["ENABLED", "SELECTION_REQUIRED", "BYPASSED", "CHECK_FAILED"]),
  reason: z.string().min(1),
  framework_id: z.number().int().positive().nullable(),
  framework_signature: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  message: z.string().min(1),
}).superRefine((value, ctx) => {
  if (value.status === "ENABLED" && (!value.framework_id || !value.framework_signature)) ctx.addIssue({ code: "custom", message: "Enabled readiness requires Framework authority." });
  if (value.status !== "ENABLED" && (value.framework_id !== null || value.framework_signature !== null)) ctx.addIssue({ code: "custom", message: "Unavailable readiness cannot carry Framework authority." });
  if (value.status === "BYPASSED" && value.reason !== "DEFAULT_SCALE_UNAVAILABLE") ctx.addIssue({ code: "custom", message: "Unsupported system bypass reason." });
});

export function participationError(code: string, message: string): Error & { code: string; statusCode: number } {
  return Object.assign(new Error(message), { code, statusCode: 409 });
}

export async function getCompetencyParticipation(repo: Pick<RunRepository, "getRun">, runId: string): Promise<CompetencyParticipation> {
  const run = await repo.getRun(runId);
  if (!run) throw Object.assign(new Error(`Run ${runId} not found.`), { code: "NOT_FOUND", statusCode: 404 });
  return run.competencyParticipation ?? unresolvedCompetencyParticipation();
}

export async function checkCompetencyFramework(config: AppConfig, injected: McpClientManager | undefined, frameworkId?: number, provisionDefault = true): Promise<Omit<CompetencyParticipation, "revision" | "checked_at">> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "" };
  if (config.moodleBaseUrl) env.MOODLE_BASE_URL = config.moodleBaseUrl;
  if (config.moodleToken) env.MOODLE_TOKEN = config.moodleToken;
  const manager = injected ?? new McpClientManager({ serverParams: { command: config.mcpServerCommand ?? "node", args: [...(config.mcpServerArgs ?? ["apps/moodle-mcp-server/dist/index.js"])], env } });
  try {
    if (!injected) await manager.connect();
    const result = await manager.callTool("moodle_competency_framework_preflight", { ...(frameworkId ? { configured_framework_id: frameworkId } : {}), provision_default: provisionDefault }, { timeoutMs: config.agentToolTimeoutMs });
    if (result.status === "error") return { status: "CHECK_FAILED", reason: result.code, framework_id: null, framework_signature: null, message: "Competency check failed. Retry or ask a Moodle administrator to check connectivity, credentials and permissions." };
    const parsed = readinessSchema.safeParse(result.data);
    if (!parsed.success) return { status: "CHECK_FAILED", reason: "INVALID_MCP_RESPONSE", framework_id: null, framework_signature: null, message: "Competency check returned an indeterminate response. Retry or contact an administrator." };
    return parsed.data;
  } catch {
    return { status: "CHECK_FAILED", reason: "MOODLE_CONNECTION_FAILED", framework_id: null, framework_signature: null, message: "Cannot check Moodle Competencies. Retry or ask an administrator to check the connection." };
  } finally { if (!injected) await manager.close(); }
}

export async function preflightCompetencies(input: { runId: string; runRepo: RunRepository; config: AppConfig; manager?: McpClientManager | undefined; enable?: boolean; expectedRevision?: number }): Promise<CompetencyParticipation> {
  const run = await input.runRepo.getRun(input.runId);
  if (!run) throw Object.assign(new Error("Run not found."), { code: "NOT_FOUND", statusCode: 404 });
  assertInstructionalDesignMutationState(run);
  const previous = await getCompetencyParticipation(input.runRepo, input.runId);
  if (input.expectedRevision !== undefined && input.expectedRevision !== previous.revision) throw participationError("COMPETENCY_PARTICIPATION_CONFLICT", "Competency participation changed; reload before retrying.");
  if (previous.reason === "TEACHER_SKIP" && !input.enable) return previous;
  const checked = await checkCompetencyFramework(input.config, input.manager, input.config.moodleCompetencyFrameworkId ?? previous.framework_id ?? undefined);
  return input.runRepo.saveCompetencyParticipation(input.runId, { ...checked, revision: previous.revision, checked_at: new Date().toISOString() }, previous.revision);
}

export async function assertCompetencyFrameworkCurrent(input: { runId: string; participation: CompetencyParticipation; config: AppConfig; manager?: McpClientManager | undefined; runRepo?: RunRepository; recordFailure?: boolean }): Promise<void> {
  if (input.participation.status !== "ENABLED" || !input.participation.framework_id || !input.participation.framework_signature) throw participationError("COMPETENCY_PREFLIGHT_REQUIRED", "Resolve Competency readiness or explicitly skip Competencies before continuing.");
  const current = await checkCompetencyFramework(input.config, input.manager, input.participation.framework_id, false);
  if (current.status === "ENABLED" && current.framework_id === input.participation.framework_id && current.framework_signature === input.participation.framework_signature) return;
  if (input.recordFailure && input.runRepo) {
    await input.runRepo.saveCompetencyParticipation(input.runId, { status: "CHECK_FAILED", reason: "FRAMEWORK_AUTHORITY_CHANGED", framework_id: null, framework_signature: null, message: "Framework authority changed. Retry preflight or explicitly skip Competencies; Candidate reviews are preserved.", revision: input.participation.revision, checked_at: new Date().toISOString() }, input.participation.revision);
  }
  throw participationError("COMPETENCY_FRAMEWORK_STALE", "Competency Framework is no longer current, visible or manageable. Retry preflight and re-approve before Execute.");
}

export async function assertSnapshotParticipationCurrent(snapshot: CompetencyExecutionSnapshot, runRepo: RunRepository, config: AppConfig, manager?: McpClientManager): Promise<void> {
  const current = await getCompetencyParticipation(runRepo, snapshot.runId);
  const approved = snapshot.participation;
  if (!approved || approved.revision !== current.revision || approved.status !== current.status || approved.framework_id !== current.framework_id || approved.framework_signature !== current.framework_signature) throw participationError("COMPETENCY_EXECUTION_SNAPSHOT_STALE", "Competency participation changed after approval. Finalize and re-approve before Execute.");
  if (approved.status === "ENABLED") await assertCompetencyFrameworkCurrent({ runId: snapshot.runId, participation: approved, config, manager });
  else if (approved.status !== "BYPASSED") throw participationError("COMPETENCY_PREFLIGHT_REQUIRED", "Resolve Competency readiness or explicitly skip Competencies.");
}
