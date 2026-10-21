import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/prisma.js";
import { config } from "../src/config.js";

vi.mock("../src/cache.js", () => ({ pingCache: vi.fn() }));
import { pingCache } from "../src/cache.js";
import { checkHealth } from "../src/health.js";
import { app } from "../src/app.js";

beforeEach(() => {
  vi.mocked(prisma.$queryRaw)
    .mockReset()
    .mockResolvedValue([{ "?column?": 1 }]);
  vi.mocked(pingCache).mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("Salute dei servizi", () => {
  it("risponde 200 senza cache e assegna un identificatore alla richiesta", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "OK",
      checks: { postgres: "OK", redis: "OK" },
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-request-id"]).toMatch(/^[\da-f-]{36}$/);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma.$queryRaw).mock.calls[0][0]).toEqual(["SELECT 1"]);
  });

  it.each(["postgres", "redis"] as const)(
    "risponde 503 quando %s non risponde",
    async (service) => {
      if (service === "postgres")
        vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("offline"));
      else vi.mocked(pingCache).mockRejectedValue(new Error("offline"));
      const response = await request(app).get("/api/health");
      expect(response.status).toBe(503);
      expect(response.body.status).toBe("ERROR");
      expect(response.body.checks).toEqual({
        postgres: service === "postgres" ? "ERROR" : "OK",
        redis: service === "redis" ? "ERROR" : "OK",
      });
    },
  );

  it("condivide le sonde contemporanee e libera il controllo dopo il timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(prisma.$queryRaw).mockReturnValue(
      new Promise(() => {}) as ReturnType<typeof prisma.$queryRaw>,
    );
    const first = checkHealth();
    expect(checkHealth()).toBe(first);
    await vi.advanceTimersByTimeAsync(config.serviceTimeoutMs);
    expect(await first).toEqual({
      status: "ERROR",
      checks: { postgres: "ERROR", redis: "OK" },
    });
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    expect((await checkHealth()).status).toBe("OK");
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
