import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/prisma.js";

vi.mock("../src/summary-provider.js", async (original) => ({
  ...(await original<typeof import("../src/summary-provider.js")>()),
  summarizePosts: vi.fn(),
}));
vi.mock("../src/cache.js", () => ({ invalidatePostsCache: vi.fn() }));
vi.mock("../src/news-events.js", () => ({ notifyNewPosts: vi.fn() }));
vi.mock("../src/logger.js", () => ({ logger: { warn: vi.fn() } }));

import {
  summarizePosts,
  SummaryProviderError,
} from "../src/summary-provider.js";
import { invalidatePostsCache } from "../src/cache.js";
import { notifyNewPosts } from "../src/news-events.js";
import { syncNewsFeed } from "../src/news-sync.js";

const feed = [
  { id: 42, title: { rendered: "Titolo" }, content: { rendered: "Testo" } },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => feed }),
  );
  vi.mocked(prisma.post.findMany).mockResolvedValue([]);
  vi.mocked(prisma.post.upsert).mockResolvedValue({} as never);
});

describe("sincronizzazione notizie", () => {
  it("salva il post senza riassunto se l'AI fallisce e riprova alla sincronizzazione successiva", async () => {
    vi.mocked(summarizePosts).mockRejectedValueOnce(
      new SummaryProviderError("offline"),
    );
    expect(await syncNewsFeed()).toMatchObject({ inserted: 1, summarized: 0 });
    expect(prisma.post.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ sourceId: "42", summary: null }),
      }),
    );
    expect(invalidatePostsCache).toHaveBeenCalledOnce();
    expect(notifyNewPosts).toHaveBeenCalledWith(1);

    vi.mocked(prisma.post.findMany).mockResolvedValueOnce([
      { sourceId: "42", title: "Titolo", content: "Testo", summary: null },
    ] as never);
    vi.mocked(summarizePosts).mockResolvedValueOnce(
      new Map([["42", "Riassunto."]]),
    );
    expect(await syncNewsFeed()).toMatchObject({
      inserted: 0,
      updated: 1,
      summarized: 1,
    });
    expect(prisma.post.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ summary: "Riassunto." }),
      }),
    );
  });

  it("rimuove il vecchio riassunto quando il contenuto cambia e l'AI fallisce", async () => {
    vi.mocked(prisma.post.findMany).mockResolvedValueOnce([
      {
        sourceId: "42",
        title: "Titolo",
        content: "Vecchio",
        summary: "Riassunto vecchio.",
      },
    ] as never);
    vi.mocked(summarizePosts).mockRejectedValueOnce(
      new SummaryProviderError("offline"),
    );
    expect(await syncNewsFeed()).toMatchObject({ updated: 1, summarized: 0 });
    expect(prisma.post.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ content: "Testo", summary: null }),
      }),
    );
  });
});
