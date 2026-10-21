import { prisma } from "./prisma.js";
import { pingCache } from "./cache.js";
import { withServiceTimeout } from "./timeout.js";
import { logger } from "./logger.js";

async function inspectHealth() {
  const results = await Promise.allSettled([
    withServiceTimeout(prisma.$queryRaw`SELECT 1`),
    withServiceTimeout(pingCache()),
  ]);
  const checks = { postgres: "OK", redis: "OK" };
  for (const [index, service] of (["postgres", "redis"] as const).entries()) {
    const result = results[index]!;
    if (result.status === "rejected") {
      checks[service] = "ERROR";
      logger.warn({
        event: "health_dependency_failed",
        dependency: service,
        err: result.reason,
      });
    }
  }
  return {
    status: Object.values(checks).every((value) => value === "OK")
      ? "OK"
      : "ERROR",
    checks,
  };
}

let pending: ReturnType<typeof inspectHealth> | undefined;
export function checkHealth() {
  // Le sonde contemporanee condividono lo stesso controllo, senza accodare query.
  return (pending ??= inspectHealth().finally(() => {
    pending = undefined;
  }));
}
