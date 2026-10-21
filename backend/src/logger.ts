import pino from "pino";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { config } from "./config.js";

export const logger = pino({
  level: config.logLevel,
  base: { service: "radiohub" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (level) => ({ level }) },
  // I messaggi degli errori possono contenere query, URL con credenziali o input.
  serializers: {
    err: (error: unknown) =>
      error instanceof Error
        ? {
            type: error.name,
            code: "code" in error ? error.code : undefined,
            stack: error.stack
              ?.split("\n")
              .filter((line) => line.trimStart().startsWith("at "))
              .join("\n"),
          }
        : { type: "UnknownError" },
  },
  redact: [
    "password",
    "passwordHash",
    "token",
    "authorization",
    "cookie",
    "AI_API_KEY",
    "JWT_SECRET",
  ],
});

export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const started = performance.now();
  const log = logger.child({ requestId });
  res.locals.log = log;
  res.set("X-Request-Id", requestId);
  function record(event: string) {
    const level =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    log[level]({
      event,
      method: req.method,
      route: req.route ? `${req.baseUrl}${req.route.path}` : "unmatched",
      status: res.statusCode,
      durationMs: Math.round(performance.now() - started),
    });
  }
  res.once("finish", () => record("http_request"));
  res.once("close", () => {
    if (!res.writableFinished) record("http_connection_closed");
  });
  next();
};
