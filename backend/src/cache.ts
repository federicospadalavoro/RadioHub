import { config } from "./config.js";
import { createClient } from "redis";
import { logger } from "./logger.js";
import { withServiceTimeout } from "./timeout.js";

const redis = createClient({
  url: config.redisUrl,
  socket: { connectTimeout: config.serviceTimeoutMs, reconnectStrategy: false },
  commandOptions: { timeout: config.serviceTimeoutMs },
  disableOfflineQueue: true,
});
redis.on("error", (err) => logger.warn({ event: "redis_unavailable", err }));
let connection: Promise<void> | undefined;

async function connect() {
  if (redis.isReady) return;
  connection ??= withServiceTimeout(redis.connect())
    .then(() => undefined)
    .catch((error) => {
      if (redis.isOpen) redis.destroy();
      throw error;
    })
    .finally(() => {
      connection = undefined;
    });
  await connection;
}

export async function pingCache() {
  await connect();
  if ((await redis.ping()) !== "PONG") throw new Error("RedisPingFailed");
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    await connect();
    const value = await redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: unknown) {
  try {
    await connect();
    await redis.set(key, JSON.stringify(value), { EX: config.cacheTtlSeconds });
  } catch {
    return;
  }
}

export async function postsCacheVersion() {
  try {
    await connect();
    return (await redis.get("posts:version")) ?? "0";
  } catch {
    return "0";
  }
}

export async function invalidatePostsCache() {
  try {
    await connect();
    await redis.incr("posts:version");
  } catch {
    return;
  }
}
