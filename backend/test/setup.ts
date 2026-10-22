import { afterEach, beforeEach, vi } from "vitest";

const localFetch = globalThis.fetch;
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
        throw new Error("Nei test le richieste esterne devono essere simulate");
      return localFetch(input, options);
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
vi.mock("../src/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    post: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
