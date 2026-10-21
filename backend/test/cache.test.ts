import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";

const redis = vi.hoisted(() => ({
  isReady: true,
  isOpen: true,
  on: vi.fn(),
  connect: vi.fn(),
  destroy: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
  ping: vi.fn(),
}));
vi.mock("redis", () => ({ createClient: vi.fn(() => redis) }));
import {
  getCache,
  setCache,
  postsCacheVersion,
  invalidatePostsCache,
  pingCache,
} from "../src/cache.js";

beforeEach(() => {
  vi.resetAllMocks();
  redis.isReady = true;
  redis.isOpen = true;
});
afterEach(() => vi.useRealTimers());

describe("Cache Redis", () => {
  it("legge il JSON e restituisce null per chiavi assenti o JSON danneggiato", async () => {
    redis.get
      .mockResolvedValueOnce('[{"id":"1"}]')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("rotto");
    expect(await getCache("radios:rock")).toEqual([{ id: "1" }]);
    expect(redis.get).toHaveBeenCalledWith("radios:rock");
    expect(await getCache("missing")).toBeNull();
    expect(await getCache("broken")).toBeNull();
  });

  it("scrive JSON con il TTL configurato di cinque minuti", async () => {
    await setCache("posts:page:0", [{ id: "1" }]);
    expect(redis.set).toHaveBeenCalledWith("posts:page:0", '[{"id":"1"}]', {
      EX: 300,
    });
    expect(config.cacheTtlSeconds).toBe(300);
  });

  it("cambia versione per rendere inutilizzabili le vecchie pagine", async () => {
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce("1");
    expect(await postsCacheVersion()).toBe("0");
    await invalidatePostsCache();
    expect(redis.incr).toHaveBeenCalledWith("posts:version");
    expect(await postsCacheVersion()).toBe("1");
  });

  it("condivide una sola connessione tra richieste simultanee", async () => {
    redis.isReady = false;
    let ready!: () => void;
    redis.connect.mockReturnValue(
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
    );
    const requests = [getCache("a"), getCache("b")];
    expect(redis.connect).toHaveBeenCalledOnce();
    redis.isReady = true;
    ready();
    await Promise.all(requests);
    expect(redis.get).toHaveBeenCalledTimes(2);
  });

  it("lascia proseguire senza cache quando Redis è guasto e poi riprova", async () => {
    redis.isReady = false;
    redis.connect.mockRejectedValue(new Error("offline"));
    expect(await getCache("a")).toBeNull();
    await expect(setCache("a", [])).resolves.toBeUndefined();
    await expect(invalidatePostsCache()).resolves.toBeUndefined();
    expect(await postsCacheVersion()).toBe("0");
    expect(redis.destroy).toHaveBeenCalled();
    redis.connect.mockResolvedValue(undefined);
    redis.get.mockResolvedValue('"online"');
    expect(await getCache("a")).toBe("online");
  });

  it("interrompe una connessione bloccata entro il timeout", async () => {
    vi.useFakeTimers();
    redis.isReady = false;
    redis.connect.mockReturnValue(new Promise(() => {}));
    const result = getCache("a");
    await vi.advanceTimersByTimeAsync(config.serviceTimeoutMs);
    expect(await result).toBeNull();
    expect(redis.destroy).toHaveBeenCalledOnce();
  });

  it("PING distingue un servizio pronto da una risposta errata", async () => {
    redis.ping.mockResolvedValueOnce("PONG").mockResolvedValueOnce("no");
    await expect(pingCache()).resolves.toBeUndefined();
    await expect(pingCache()).rejects.toThrow("RedisPingFailed");
  });

  it("un errore dei comandi non interrompe la lettura dell'app", async () => {
    redis.get.mockRejectedValue(new Error("timeout"));
    redis.set.mockRejectedValue(new Error("timeout"));
    expect(await getCache("a")).toBeNull();
    await expect(setCache("a", [])).resolves.toBeUndefined();
  });
});
