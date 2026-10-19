import "dotenv/config";
import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
});
redis.on("error", () =>
  console.error("Redis non raggiungibile; cache disattivata"),
);
let connection: Promise<void> | undefined;

async function connect() {
  if (!redis.isOpen) {
    connection ??= redis
      .connect()
      .then(() => undefined)
      .finally(() => (connection = undefined));
    await connection;
  }
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
    await redis.set(key, JSON.stringify(value), { EX: 300 });
  } catch {
    // Redis è facoltativo per servire la richiesta.
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
    // La scadenza evita di mantenere dati obsoleti se Redis non è disponibile.
  }
}
