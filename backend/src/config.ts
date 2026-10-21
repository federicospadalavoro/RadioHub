import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

// Funziona sia da src sia da dist, indipendentemente dalla cartella del terminale.
loadEnv({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

function integer(name: string, fallback: number, min = 1, max = 2_147_483_647) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${name} deve essere un intero tra ${min} e ${max}`);
  return value;
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} non configurato`);
  return encodeURIComponent(value);
}

function boolean(name: string, fallback: boolean) {
  const value = process.env[name];
  if (!value) return fallback;
  if (value !== "true" && value !== "false")
    throw new Error(`${name} deve essere true oppure false`);
  return value === "true";
}
export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: integer("PORT", 3000, 1, 65535),
  frontendPort: integer("FRONTEND_PORT", 5173, 1, 65535),
  get databaseUrl() {
    return (
      process.env.DATABASE_URL ||
      `postgresql://${required("POSTGRES_USER")}:${required("POSTGRES_PASSWORD")}@${process.env.POSTGRES_HOST ?? "localhost"}:${integer("POSTGRES_PORT", 5432, 1, 65535)}/${required("POSTGRES_DB")}`
    );
  },
  redisUrl:
    process.env.REDIS_URL ||
    `redis://${process.env.REDIS_HOST ?? "localhost"}:${integer("REDIS_PORT", 6379, 1, 65535)}`,
  cacheTtlSeconds: integer("CACHE_TTL_SECONDS", 300),
  newsSyncIntervalMs: integer("NEWS_SYNC_INTERVAL_MS", 300_000),
  newsFeedUrl:
    process.env.NEWS_FEED_URL ?? "https://d3r6kmd22dkoyn.cloudfront.net/",
  fmWorldUrl:
    process.env.FM_WORLD_URL ?? "https://connect.fm-world.com/client2/radios",
  upstreamTimeoutMs: integer("UPSTREAM_TIMEOUT_MS", 10_000),
  aiTimeoutMs: integer("AI_TIMEOUT_MS", 30_000),
  aiSearchTimeoutMs: integer("AI_SEARCH_TIMEOUT_MS", 15_000),
  aiApiUrl: process.env.AI_API_URL ?? "https://api.openai.com/v1/responses",
  aiModel: process.env.AI_MODEL ?? "gpt-6-luna",
  aiReasoningEffort: process.env.AI_REASONING_EFFORT ?? "low",
  aiSummaryMaxTokens: integer("AI_SUMMARY_MAX_TOKENS", 1000),
  aiAnswerMaxTokens: integer("AI_ANSWER_MAX_TOKENS", 500),
  aiMaxTitleChars: integer("AI_MAX_TITLE_CHARS", 500),
  aiMaxContentChars: integer("AI_MAX_CONTENT_CHARS", 12_000),
  aiSourceMaxChars: integer("AI_SOURCE_MAX_CHARS", 3000),
  accessTokenSeconds: integer("ACCESS_TOKEN_SECONDS", 900),
  refreshTokenDays: integer("REFRESH_TOKEN_DAYS", 7, 1, 365),
  cookieSecure: boolean("COOKIE_SECURE", process.env.NODE_ENV === "production"),
  passwordHashRounds: integer("PASSWORD_HASH_ROUNDS", 12, 10, 15),
  apiRateLimit: integer("API_RATE_LIMIT", 300),
  authRateLimit: integer("AUTH_RATE_LIMIT", 10),
  aiRateLimit: integer("AI_RATE_LIMIT", 10),
  rateLimitWindowMs: integer("RATE_LIMIT_WINDOW_MS", 900_000),
  aiRateLimitWindowMs: integer("AI_RATE_LIMIT_WINDOW_MS", 60_000),
  sseMaxClients: integer("SSE_MAX_CLIENTS", 100),
  sseHeartbeatMs: integer("SSE_HEARTBEAT_MS", 25_000),
  sseRetryMs: integer("SSE_RETRY_MS", 3000),
  serviceTimeoutMs: integer("SERVICE_TIMEOUT_MS", 3000),
  logLevel: process.env.LOG_LEVEL ?? "info",
};
