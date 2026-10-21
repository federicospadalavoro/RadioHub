import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import {
  searchFmWorldRadios,
  getFmWorldRadio,
  FmWorldError,
  radioCategories,
} from "./fm-world.js";
import { prisma } from "./prisma.js";
import { getCache, postsCacheVersion, setCache } from "./cache.js";
import { authRouter, requireAuth } from "./auth.js";
import { isNewsSyncRunning, NewsFeedError, syncNewsFeed } from "./news-sync.js";
import { interpretRadioSearch } from "./radio-search.js";
import { answerNewsQuestion } from "./news-qa.js";
import { subscribeToNews } from "./news-events.js";
import { security, aiLimiter } from "./security.js";
import { radioCatalog } from "./radio-catalog.js";
import { getPostSummary } from "./post-summary.js";
import { SummaryProviderError } from "./summary-provider.js";
import { config } from "./config.js";
import { requestLogger } from "./logger.js";
import { checkHealth } from "./health.js";

export const app = express();
const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
app.use(requestLogger);

app.use(
  "/api/docs-assets",
  helmet(),
  express.static(resolve(backendDir, "node_modules/rapidoc/dist")),
);
app.get("/api/openapi.yaml", helmet(), (_req, res) =>
  res.sendFile(resolve(backendDir, "openapi.yaml")),
);
app.get("/api/docs", helmet(), (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="it">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body><rapi-doc spec-url="/api/openapi.yaml" render-style="read"></rapi-doc>
    <script type="module" src="/api/docs-assets/rapidoc-min.js"></script>
  </body>
</html>`);
});

if (process.env.TRUST_PROXY)
  app.set("trust proxy", Number(process.env.TRUST_PROXY));
app.use("/api", ...security);
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());
app.use("/api/auth", authRouter);

app.get("/api/health", async (_req, res) => {
  const result = await checkHealth();
  res
    .set("Cache-Control", "no-store")
    .status(result.status === "OK" ? 200 : 503)
    .json(result);
});

app.get("/api/favorites", requireAuth, async (_req, res) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: res.locals.userId },
  });
  res.json(favorites);
});

app.post("/api/favorites", requireAuth, async (req, res) => {
  const { radioId, radioName, streamUrl, logoUrl } = req.body ?? {};
  if (typeof radioId !== "string" || typeof radioName !== "string") {
    res.status(400).json({ error: "radioId e radioName sono obbligatori" });
    return;
  }
  const favorite = await prisma.favorite.upsert({
    where: { userId_radioId: { userId: res.locals.userId, radioId } },
    create: {
      userId: res.locals.userId,
      radioId,
      radioName,
      streamUrl: typeof streamUrl === "string" ? streamUrl : null,
      logoUrl: typeof logoUrl === "string" ? logoUrl : null,
    },
    update: {
      radioName,
      streamUrl: typeof streamUrl === "string" ? streamUrl : null,
      logoUrl: typeof logoUrl === "string" ? logoUrl : null,
    },
  });
  res.status(201).json(favorite);
});

app.delete("/api/favorites/:radioId", requireAuth, async (req, res) => {
  const radioId =
    typeof req.params.radioId === "string" ? req.params.radioId : "";
  if (!radioId) {
    res.status(400).json({ error: "radioId mancante" });
    return;
  }
  await prisma.favorite.deleteMany({
    where: { userId: res.locals.userId, radioId },
  });
  res.status(204).end();
});

app.post("/api/sync", aiLimiter, async (_req, res) => {
  if (isNewsSyncRunning()) {
    res.status(409).json({ error: "Sincronizzazione già in corso" });
    return;
  }
  try {
    res.json(await syncNewsFeed());
  } catch (error) {
    res.locals.log.error({ event: "news_sync_failed", err: error });
    res.status(error instanceof NewsFeedError ? 502 : 500).json({
      error:
        error instanceof Error ? error.message : "Sincronizzazione fallita",
    });
  }
});

app.get("/api/posts/events", subscribeToNews);

app.get("/api/posts/:id/summary", aiLimiter, async (req, res) => {
  try {
    const result = await getPostSummary(String(req.params.id));
    if (!result) {
      res.status(404).json({ error: "Notizia non trovata" });
      return;
    }
    res.json(result);
  } catch (error) {
    res.locals.log.error({ event: "post_summary_failed", err: error });
    res.status(error instanceof SummaryProviderError ? 502 : 500).json({
      error:
        error instanceof SummaryProviderError
          ? error.message
          : "Impossibile caricare il riassunto",
    });
  }
});

app.post("/api/news/ask", aiLimiter, async (req, res) => {
  const question =
    typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question || question.length > 500) {
    res
      .status(400)
      .json({ error: "Inserisci una domanda di massimo 500 caratteri" });
    return;
  }
  try {
    res.json(await answerNewsQuestion(question));
  } catch (error) {
    res.locals.log.error({ event: "news_question_failed", err: error });
    res.status(502).json({
      error: error instanceof Error ? error.message : "Domanda non riuscita",
    });
  }
});

app.get("/api/posts", async (req, res) => {
  const title =
    typeof req.query.title === "string" ? req.query.title.trim() : "";
  const items =
    typeof req.query.items === "string" ? Number(req.query.items) : 10;
  const skip = req.query.skip === undefined ? 0 : Number(req.query.skip);

  if (
    !Number.isInteger(items) ||
    items < 1 ||
    items > 50 ||
    !Number.isSafeInteger(skip) ||
    skip < 0
  ) {
    res.status(400).json({
      error:
        "items deve essere tra 1 e 50; skip deve essere un intero positivo o zero",
    });
    return;
  }

  try {
    const key = `posts:page:${await postsCacheVersion()}:${JSON.stringify([title.toLowerCase(), items, skip])}`;
    const cached = await getCache<{ posts: unknown[]; total: number }>(key);
    if (cached) {
      res.set("X-Total-Count", String(cached.total)).json(cached.posts);
      return;
    }
    const where = title
      ? { title: { contains: title, mode: "insensitive" as const } }
      : {};
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: [
          { publishedAt: { sort: "desc", nulls: "last" } },
          { id: "desc" },
        ],
        take: items,
        skip,
        select: {
          id: true,
          title: true,
          publishedAt: true,
          summary: true,
          imageUrl: true,
          content: true,
          excerpt: true,
        },
      }),
      prisma.post.count({ where }),
    ]);
    const result = posts.map(({ content, excerpt, ...post }) => {
      return {
        ...post,
        content: content
          .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
          .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]*>/g, "")
          .replace(/[ \t]+/g, " ")
          .trim(),
        excerpt: (excerpt || content)
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 210),
      };
    });
    await setCache(key, { posts: result, total });
    res.set("X-Total-Count", String(total)).json(result);
  } catch (error) {
    res.locals.log.error({ event: "posts_read_failed", err: error });
    res.status(500).json({ error: "Impossibile caricare le notizie" });
  }
});

app.get("/api/radios/popular", (_req, res) => {
  res
    .set("Cache-Control", `public, max-age=${config.cacheTtlSeconds}`)
    .json(radioCatalog);
});

app.get("/api/radios/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!/^[1-9]\d{0,14}$/.test(id)) {
    res.status(400).json({ error: "ID radio non valido" });
    return;
  }
  const token = process.env.FM_WORLD_TOKEN;
  if (!token) {
    res.status(500).json({ error: "Token mancante" });
    return;
  }
  try {
    const key = `radios:fm-world:id:${id}`;
    const cached = await getCache(key);
    const radio = cached ?? (await getFmWorldRadio(id, token));
    if (!radio) {
      res.status(404).json({ error: "Radio non trovata o senza stream audio" });
      return;
    }
    if (!cached) await setCache(key, radio);
    res.json(radio);
  } catch (err) {
    res.locals.log.error({ event: "radio_read_failed", err });
    res
      .status(err instanceof FmWorldError ? err.status : 502)
      .json({ error: "Impossibile recuperare la radio condivisa" });
  }
});

app.get("/api/radios", async (req, res) => {
  const query =
    typeof req.query.query === "string" ? req.query.query.trim() : "";
  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 10;
  const category =
    req.query.category === undefined ? null : Number(req.query.category);
  const country =
    typeof req.query.country === "string" ? req.query.country : "";

  if (!query && category === null && !country) {
    res.status(400).json({ error: "query mancante" });
    return;
  }

  if (
    (category !== null && !Object.hasOwn(radioCategories, category)) ||
    !/^(?:[A-Z]{2})?$/.test(country)
  ) {
    res.status(400).json({ error: "Genere o paese non valido" });
    return;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    res.status(400).json({ error: "Il limite deve essere tra 1 e 50" });
    return;
  }

  const token = process.env.FM_WORLD_TOKEN;

  if (!token) {
    res.status(500).json({ error: "Token mancante" });
    return;
  }

  try {
    const key = `radios:fm-world:filters:${JSON.stringify([query.toLowerCase(), limit, category, country])}`;
    const cached = await getCache<unknown[]>(key);
    if (cached) {
      res.json(cached);
      return;
    }
    const radios = await searchFmWorldRadios(
      query,
      limit,
      token,
      category,
      country,
    );
    await setCache(key, radios);
    res.json(radios);
  } catch (error) {
    res.locals.log.error({ event: "radio_search_failed", err: error });
    res.status(error instanceof FmWorldError ? error.status : 502).json({
      error:
        error instanceof Error ? error.message : "Errore nella ricerca radio",
      ...(error instanceof FmWorldError && error.sourceStatus
        ? { sourceStatus: error.sourceStatus }
        : {}),
    });
  }
});

app.post("/api/radios/interpret", aiLimiter, async (req, res) => {
  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt || prompt.length > 500) {
    res
      .status(400)
      .json({ error: "Inserisci una richiesta di massimo 500 caratteri" });
    return;
  }
  if (process.env.LLM_PROVIDER !== "openai" || !process.env.AI_API_KEY) {
    res.status(503).json({ error: "Ricerca AI non configurata" });
    return;
  }
  try {
    res.json(await interpretRadioSearch(prompt));
  } catch (error) {
    res.locals.log.error({ event: "radio_interpretation_failed", err: error });
    res.status(502).json({
      error: error instanceof Error ? error.message : "Ricerca AI non riuscita",
    });
  }
});

const handleError: ErrorRequestHandler = (error, _req, res, next) => {
  res.locals.log.error({ event: "http_error", err: error });
  if (res.headersSent) {
    next(error);
    return;
  }
  const status =
    error.status === 400 || error.status === 413 ? error.status : 500;
  res.status(status).json({
    error:
      status === 500
        ? "Errore interno del server"
        : "Corpo della richiesta non valido o troppo grande",
  });
};
app.use(handleError);
