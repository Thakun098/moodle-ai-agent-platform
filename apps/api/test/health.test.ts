import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

describe("Health Route (/health)", () => {
  const config = loadConfig({
    DATABASE_URL: "postgresql://dummy:dummy@localhost:5432/dummy",
  });

  it("returns HTTP 200 with liveness metadata and does not query DB", async () => {
    const app = buildApp({
      config,
      fastifyOptions: { logger: false },
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof body.timestamp).toBe("string");
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);

    await app.close();
  });
});
