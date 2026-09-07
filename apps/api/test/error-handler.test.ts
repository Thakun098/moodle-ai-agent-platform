import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

describe("Central Error Handler", () => {
  const config = loadConfig({
    DATABASE_URL: "postgresql://dummy:dummy@localhost:5432/dummy",
  });

  it("handles 404 Not Found with standard error response format", async () => {
    const app = buildApp({
      config,
      fastifyOptions: { logger: false },
    });

    const response = await app.inject({
      method: "GET",
      url: "/non-existent-route",
    });

    expect(response.statusCode).toBe(404);

    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("Route GET:/non-existent-route not found");
    expect(body.error.details).toBeNull();
    expect(body.error.request_id).toBeDefined();
    expect(typeof body.error.request_id).toBe("string");

    await app.close();
  });

  it("handles explicit client errors (400 Bad Request) with message and code", async () => {
    const app = buildApp({
      config,
      fastifyOptions: { logger: false },
    });

    app.get("/trigger-bad-request", async () => {
      const err = new Error("Custom client validation error");
      (err as any).statusCode = 400;
      (err as any).code = "VALIDATION_FAILED";
      (err as any).details = [{ field: "email", error: "invalid" }];
      throw err;
    });

    const response = await app.inject({
      method: "GET",
      url: "/trigger-bad-request",
    });

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.message).toBe("Custom client validation error");
    expect(body.error.details).toEqual([{ field: "email", error: "invalid" }]);
    expect(body.error.request_id).toBeDefined();

    await app.close();
  });

  it("handles unexpected server errors (500) sanitizing messages and hiding stack traces", async () => {
    const app = buildApp({
      config,
      fastifyOptions: { logger: false },
    });

    app.get("/trigger-internal-error", async () => {
      throw new Error("Sensitive database password or SQL query failure");
    });

    const response = await app.inject({
      method: "GET",
      url: "/trigger-internal-error",
    });

    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(body.error.message).toBe("Internal server error");
    expect(body.error.details).toBeNull();
    expect(body.error.request_id).toBeDefined();
    expect(response.body).not.toContain("Sensitive database password");

    await app.close();
  });
});
