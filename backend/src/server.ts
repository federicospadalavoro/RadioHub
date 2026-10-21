import { app } from "./app.js";
import { config } from "./config.js";
import { startNewsSyncJob } from "./news-job.js";
import { logger } from "./logger.js";
import express from "express";
import { resolve } from "node:path";

// In hosting lo stesso server può servire anche il frontend già compilato.
if (process.env.STATIC_DIR)
  app.use(express.static(resolve(process.env.STATIC_DIR), { maxAge: 0 }));

const server = app.listen(config.port, config.host, () => {
  logger.info({
    event: "server_started",
    host: config.host,
    port: config.port,
  });
  startNewsSyncJob();
  logger.info({
    event: "news_sync_scheduled",
    intervalMs: config.newsSyncIntervalMs,
  });
});
server.on("error", (err) => {
  logger.fatal({ event: "server_start_failed", err });
  process.exitCode = 1;
});
