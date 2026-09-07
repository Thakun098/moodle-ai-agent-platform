import { closeDatabase, getDatabase } from "@moodle-agent-poc/agent-runtime";
import { buildApp } from "./app.js";
import { loadConfig } from "./config/config-loader.js";

async function main() {
  const config = loadConfig();

  // Ensure DB connection is initialized
  getDatabase();

  const app = buildApp({ config });

  const closeGracefully = async (signal: string) => {
    app.log.info({ signal }, "Received signal, shutting down gracefully...");
    try {
      await app.close();
      await closeDatabase();
      app.log.info("Server and database connections closed cleanly.");
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Error during graceful shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => closeGracefully("SIGINT"));
  process.on("SIGTERM", () => closeGracefully("SIGTERM"));

  try {
    const address = await app.listen({
      port: config.port,
      host: config.host,
    });
    app.log.info(
      {
        address,
        port: config.port,
        host: config.host,
        modelProvider: config.modelProvider,
        model: config.modelName,
      },
      "Moodle AI Platform API server is running"
    );
  } catch (err) {
    app.log.error({ err }, "Failed to start API server");
    await closeDatabase();
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))
) {
  main();
}

export { main };
