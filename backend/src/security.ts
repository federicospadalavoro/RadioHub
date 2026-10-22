import { config } from "./config.js";
import type { RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { hostname, networkInterfaces } from "node:os";
import { rateLimit } from "express-rate-limit";

const origins = (
  process.env.CORS_ORIGINS ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${config.frontendPort},http://127.0.0.1:${config.frontendPort}`
)
  .split(",")
  .map((origin) => origin.trim());
if (process.env.NODE_ENV !== "production") {
  const hosts = [
    hostname(),
    ...Object.values(networkInterfaces())
      .flat()
      .filter((address) => address?.family === "IPv4")
      .map((address) => address!.address),
  ];
  origins.push(...hosts.map((host) => `http://${host}:${config.frontendPort}`));
}

const checkOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  if (
    (origin && !origins.includes(origin)) ||
    (!origin && req.get("sec-fetch-site") === "cross-site")
  ) {
    res.status(403).json({ error: "Origine non consentita" });
    return;
  }
  next();
};

function limiter(
  limit: number,
  windowMs: number,
  skipSuccessfulRequests = false,
) {
  return rateLimit({
    limit,
    windowMs,
    skipSuccessfulRequests,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Troppe richieste, riprova più tardi" },
  });
}

export const security = [
  helmet(),
  checkOrigin,
  cors({
    origin: origins,
    credentials: true,
    exposedHeaders: ["X-Total-Count", "X-Request-Id"],
  }),
  limiter(config.apiRateLimit, config.rateLimitWindowMs),
];
export const loginLimiter = limiter(
  config.authRateLimit,
  config.rateLimitWindowMs,
  true,
);
export const aiLimiter = limiter(
  config.aiRateLimit,
  config.aiRateLimitWindowMs,
);
