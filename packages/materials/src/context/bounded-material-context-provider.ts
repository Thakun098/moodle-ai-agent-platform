import { MaterialIngestionError } from "../errors/material-errors.js";
import { estimateMaterialTokens } from "../ingest.js";
import type { MaterialContext, MaterialSnapshotReader } from "../types.js";

export class BoundedMaterialContextProvider {
  constructor(
    private readonly snapshots: MaterialSnapshotReader,
    private readonly tokenBudget: number,
  ) {}

  async getContext(snapshotId: string): Promise<MaterialContext> {
    const snapshot = await this.snapshots.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new MaterialIngestionError("MATERIAL_SNAPSHOT_NOT_FOUND", `Material snapshot "${snapshotId}" was not found.`, { snapshot_id: snapshotId });
    }
    const estimatedTokens = estimateMaterialTokens(snapshot.normalizedText);
    if (estimatedTokens > this.tokenBudget) {
      throw new MaterialIngestionError(
        "MATERIAL_CONTEXT_TOO_LARGE",
        `Material context for section "${snapshot.sectionRef}" exceeds the configured activity context budget.`,
        { estimated_tokens: estimatedTokens, configured_budget: this.tokenBudget, section_ref: snapshot.sectionRef },
      );
    }
    return {
      snapshotId: snapshot.id,
      sectionRef: snapshot.sectionRef,
      text: snapshot.normalizedText,
      sourceRefs: snapshot.files
        .filter((file) => file.useForGrounding && file.extractionStatus === "success")
        .map((file) => ({ source: file.filename, section: snapshot.sectionRef })),
      estimatedTokens,
    };
  }
}
