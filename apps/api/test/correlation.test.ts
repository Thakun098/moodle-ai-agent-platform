import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

describe("Correlation Plugin", () => {
  const config = loadConfig({
    DATABASE_URL: "postgresql://dummy:dummy@localhost:5432/dummy",
  });

  it("uses provided x-request-id as canonical request.id and echoes header in response", async () => {
    const app = buildApp({
      config,
      fastifyOptions: { logger: false },
    });

    app.get("/test-req-id", async (request) => {
      return { requestId: request.id };
    });

    const customReqId = "custom-client-req-id-12345";
    const response = await app.inject({
      method: "GET",
      url: "/test-req-id",
      headers: {
        "x-request-id": customReqId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe(customReqId);

    const body = JSON.parse(response.body);
    expect(body.requestId).toBe(customReqId);

    await app.close();
  });

  it("generates a request ID when x-request-id is omitted", async () => {
    const app = buildApp({
      config,
      fastifyOptions: { logger: false },
    });

    app.get("/test-gen-id", async (request) => {
      return { requestId: request.id };
    });

    const response = await app.inject({
      method: "GET",
      url: "/test-gen-id",
    });

    expect(response.statusCode).toBe(200);
    const returnedHeader = response.headers["x-request-id"];
    expect(typeof returnedHeader).toBe("string");
    expect(returnedHeader).toBeTruthy();

    const body = JSON.parse(response.body);
    expect(body.requestId).toBe(returnedHeader);

    await app.close();
  });

  it("attaches valid x-run-id to request context and echoes header in response", async () => {
    const app = buildApp({
      config,
      fastifyOptions: { logger: false },
    });

    app.get("/test-run-id", async (request) => {
      return { runId: request.runId };
    });

    const validRunId = "11111111-2222-4333-8444-555555555555";
    const response = await app.inject({
      method: "GET",
      url: "/test-run-id",
      headers: {
        "x-run-id": validRunId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-run-id"]).toBe(validRunId);

    const body = JSON.parse(response.body);
    expect(body.runId).toBe(validRunId);

    await app.close();
  });

  it("leaves request.runId undefined when x-run-id header is absent", async () => {
    const app = buildApp({
      config,
      fastifyOptions: { logger: false },
    });

    app.get("/test-no-run-id", async (request) => {
      return { runId: request.runId ?? null };
    });

    const response = await app.inject({
      method: "GET",
      url: "/test-no-run-id",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-run-id"]).toBeUndefined();

    const body = JSON.parse(response.body);
    expect(body.runId).toBeNull();

    await app.close();
  });

  it("rejects invalid x-run-id format with HTTP 400 and standard error shape", async () => {
    const app = buildApp({
      config,
      fastifyOptions: { logger: false },
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        "x-run-id": "not-a-valid-uuid",
      },
    });

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("INVALID_RUN_ID");
    expect(body.error.message).toContain("must be a valid UUID");
    expect(body.error.request_id).toBeDefined();

    await app.close();
  });
});
