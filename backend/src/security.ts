import "dotenv/config";
import type { RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

const origins = (
  process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim());

const checkOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  // Blocca anche le richieste che scrivono cookie: CORS da solo non lo fa.
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
  cors({ origin: origins, credentials: true }),
  limiter(Number(process.env.API_RATE_LIMIT ?? 300), 15 * 60_000),
];
export const loginLimiter = limiter(
  Number(process.env.AUTH_RATE_LIMIT ?? 10),
  15 * 60_000,
  true,
);
export const aiLimiter = limiter(
  Number(process.env.AI_RATE_LIMIT ?? 10),
  60_000,
);
