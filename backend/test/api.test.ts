import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/prisma.js";

vi.mock("../src/cache.js", () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  postsCacheVersion: vi.fn(),
  invalidatePostsCache: vi.fn(),
}));
vi.mock("../src/fm-world.js", async (original) => ({
  ...(await original<typeof import("../src/fm-world.js")>()),
  searchFmWorldRadios: vi.fn(),
}));
vi.mock("../src/summary-provider.js", async (original) => ({
  ...(await original<typeof import("../src/summary-provider.js")>()),
  summarizePosts: vi.fn(),
}));
import {
  getCache,
  setCache,
  postsCacheVersion,
  invalidatePostsCache,
} from "../src/cache.js";
import { searchFmWorldRadios } from "../src/fm-world.js";
import { summarizePosts } from "../src/summary-provider.js";
import { app } from "../src/app.js";
import { getPostSummary } from "../src/post-summary.js";

const post = {
  id: "p1",
  sourceId: "1",
  title: "Musica",
  content: "<p>Testo</p><script>male()</script>",
  excerpt: "<p>Anteprima</p>",
  summary: null,
  publishedAt: null,
  imageUrl: null,
};
const radio = {
  id: "r1",
  name: "Rock FM",
  streamUrl: "https://stream.test/live",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCache).mockResolvedValue(null);
  vi.mocked(postsCacheVersion).mockResolvedValue("0");
  vi.mocked(prisma.post.findMany).mockResolvedValue([post] as never);
  vi.mocked(prisma.post.count).mockResolvedValue(21);
  vi.mocked(prisma.post.findUnique).mockResolvedValue(post as never);
  vi.mocked(prisma.post.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(summarizePosts).mockResolvedValue(
    new Map([["1", "Riassunto nuovo."]]),
  );
  vi.mocked(searchFmWorldRadios).mockResolvedValue([radio] as never);
});

describe("API notizie e cache", () => {
  it("filtra e pagina PostgreSQL, ripulisce il contenuto e salva risposta e totale", async () => {
    const response = await request(app).get(
      "/api/posts?title= Musica &items=2&skip=10",
    );
    expect(response.status).toBe(200);
    expect(response.headers["x-total-count"]).toBe("21");
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              NOT: {
                title: {
                  equals: "Notizia di esempio",
                  mode: "insensitive",
                },
              },
            },
            { title: { contains: "Musica", mode: "insensitive" } },
          ],
        },
        take: 2,
        skip: 10,
      }),
    );
    expect(response.body[0]).toMatchObject({
      id: "p1",
      content: "Testo",
      excerpt: "Anteprima",
    });
    expect(setCache).toHaveBeenCalledWith(
      'posts:page:without-example:0:["musica",2,10]',
      { posts: response.body, total: 21 },
    );
  });

  it("riusa la pagina senza interrogare PostgreSQL; dopo un miss la ricarica", async () => {
    vi.mocked(getCache).mockResolvedValueOnce({ posts: [post], total: 21 });
    const response = await request(app).get("/api/posts");
    expect(response.body).toEqual([post]);
    expect(response.headers["x-total-count"]).toBe("21");
    expect(prisma.post.findMany).not.toHaveBeenCalled();
    expect(prisma.post.count).not.toHaveBeenCalled();
    await request(app).get("/api/posts");
    expect(prisma.post.findMany).toHaveBeenCalledOnce();
  });

  it("distingue filtro, pagina, limite e versione nelle chiavi", async () => {
    for (const query of [
      "title=Rock&items=2",
      "title=Pop&items=2",
      "title=Rock&items=3",
      "title=Rock&items=2&skip=2",
    ])
      await request(app).get(`/api/posts?${query}`);
    vi.mocked(postsCacheVersion).mockResolvedValue("1");
    await request(app).get("/api/posts?title=Rock&items=2");
    expect(
      new Set(vi.mocked(getCache).mock.calls.map(([key]) => key)).size,
    ).toBe(5);
  });

  it.each(["items=0", "items=51", "items=1.5", "skip=-1", "skip=abc"])(
    "rifiuta %s prima di leggere i dati",
    async (query) => {
      expect((await request(app).get(`/api/posts?${query}`)).status).toBe(400);
      expect(getCache).not.toHaveBeenCalled();
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    },
  );

  it("restituisce un errore gestito se PostgreSQL fallisce", async () => {
    vi.mocked(prisma.post.findMany).mockRejectedValue(new Error("offline"));
    expect((await request(app).get("/api/posts")).status).toBe(500);
    expect(setCache).not.toHaveBeenCalled();
  });
});

describe("API radio e cache", () => {
  it("serve anche un risultato vuoto dalla cache senza chiamare FM-World", async () => {
    vi.mocked(getCache).mockResolvedValue([]);
    expect((await request(app).get("/api/radios?query=rock")).body).toEqual([]);
    expect(searchFmWorldRadios).not.toHaveBeenCalled();
  });

  it("passa i filtri a FM-World e separa le chiavi per paese e genere", async () => {
    for (const query of [
      "category=14&country=IT",
      "category=14&country=US",
      "category=20&country=IT",
    ]) {
      const response = await request(app).get(`/api/radios?${query}&limit=3`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual([radio]);
    }
    expect(searchFmWorldRadios).toHaveBeenCalledWith(
      "",
      3,
      "test-token",
      14,
      "IT",
    );
    expect(
      new Set(vi.mocked(getCache).mock.calls.map(([key]) => key)).size,
    ).toBe(3);
    expect(setCache).toHaveBeenCalledTimes(3);
  });

  it.each(["", "query=a&limit=51", "category=-1", "country=Italia"])(
    "rifiuta filtri errati: %s",
    async (query) => {
      expect((await request(app).get(`/api/radios?${query}`)).status).toBe(400);
      expect(searchFmWorldRadios).not.toHaveBeenCalled();
    },
  );
});

describe("API riassunti", () => {
  it("riusa il riassunto salvato senza chiamare l'AI", async () => {
    vi.mocked(prisma.post.findUnique).mockResolvedValue({
      ...post,
      summary: "Già salvato.",
    } as never);
    expect((await request(app).get("/api/posts/p1/summary")).body).toEqual({
      id: "p1",
      summary: "Già salvato.",
    });
    expect(summarizePosts).not.toHaveBeenCalled();
  });

  it("genera una sola volta per richieste simultanee, salva e invalida la cache", async () => {
    const first = getPostSummary("p1");
    expect(getPostSummary("p1")).toBe(first);
    expect(await first).toEqual({ id: "p1", summary: "Riassunto nuovo." });
    expect(summarizePosts).toHaveBeenCalledOnce();
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      where: {
        id: "p1",
        title: post.title,
        content: post.content,
        summary: null,
      },
      data: { summary: "Riassunto nuovo." },
    });
    expect(invalidatePostsCache).toHaveBeenCalledOnce();
  });

  it("risponde 404 per notizie inesistenti e 502 se il provider non produce un riassunto", async () => {
    vi.mocked(prisma.post.findUnique).mockResolvedValueOnce(null);
    expect((await request(app).get("/api/posts/missing/summary")).status).toBe(
      404,
    );
    vi.mocked(summarizePosts).mockResolvedValue(new Map());
    expect((await request(app).get("/api/posts/p1/summary")).status).toBe(502);
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
  });
});
