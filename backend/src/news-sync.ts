import { prisma } from "./prisma.js";
import { summarizePosts, MOCK_SUMMARY_PREFIX } from "./summary-provider.js";
import { invalidatePostsCache } from "./cache.js";
import { notifyNewPosts } from "./news-events.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
let syncing = false;

export class NewsFeedError extends Error {}

export function isNewsSyncRunning() {
  return syncing;
}

type FeedPost = {
  id: number;
  date_gmt?: string;
  date?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
  yoast_head_json?: { og_image?: { url?: string }[] };
  _embedded?: { "wp:featuredmedia"?: { source_url?: string }[] };
};

type PostData = {
  sourceId: string;
  title: string;
  content: string;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
};

export async function fetchNewsFeed(ids: string[] = []): Promise<unknown> {
  const url = new URL(config.newsFeedUrl);
  if (ids.length) {
    url.searchParams.set("include", ids.join(","));
    url.searchParams.set("per_page", "100");
  }
  let response: Response;
  try {
    response = await fetch(url.href, {
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
  } catch {
    throw new NewsFeedError("Feed notizie non raggiungibile o timeout");
  }

  if (!response.ok) {
    throw new NewsFeedError(
      `Feed notizie ha risposto con HTTP ${response.status}`,
    );
  }

  return response.json();
}

function parsePublishedAt(dateGmt?: string, date?: string): Date | null {
  const value = dateGmt ?? date;

  if (!value) return null;

  const withTimezone = dateGmt
    ? /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
      ? value
      : `${value}Z`
    : value;
  const parsed = new Date(withTimezone);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatNewsFeed(data: unknown): PostData[] {
  if (!Array.isArray(data)) {
    throw new NewsFeedError(
      "Il feed notizie non ha restituito un elenco di post",
    );
  }

  return (data as FeedPost[]).map((post, index) => {
    if (typeof post.id !== "number" || !post.title?.rendered) {
      throw new NewsFeedError(
        `Il post numero ${index + 1} non contiene ID o titolo`,
      );
    }

    return {
      sourceId: String(post.id),
      title: post.title.rendered,
      content: post.content?.rendered ?? post.excerpt?.rendered ?? "",
      excerpt: post.excerpt?.rendered || null,
      imageUrl:
        [
          ...(post.yoast_head_json?.og_image ?? []).map((image) => image.url),
          post._embedded?.["wp:featuredmedia"]?.[0]?.source_url,
          /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(
            post.content?.rendered ?? "",
          )?.[1],
        ]
          .find((url) => url && /^https?:\/\//i.test(url))
          ?.replace(/&amp;/g, "&") ?? null,
      publishedAt: parsePublishedAt(post.date_gmt, post.date),
    };
  });
}

export async function backfillNewsImages() {
  const missing = await prisma.post.findMany({
    where: { imageUrl: null },
    select: { sourceId: true },
  });
  const ids = missing
    .map((post) => post.sourceId)
    .filter((id) => /^\d+$/.test(id));
  let updated = 0;
  for (let start = 0; start < ids.length; start += 100) {
    const posts = formatNewsFeed(
      await fetchNewsFeed(ids.slice(start, start + 100)),
    );
    for (const post of posts)
      if (post.imageUrl) {
        const result = await prisma.post.updateMany({
          where: { sourceId: post.sourceId, imageUrl: null },
          data: { imageUrl: post.imageUrl },
        });
        updated += result.count;
      }
  }
  if (updated) await invalidatePostsCache();
  return updated;
}

export async function syncNewsFeed() {
  if (syncing) throw new Error("Sincronizzazione già in corso");
  syncing = true;
  try {
    const rawPosts = await fetchNewsFeed();
    const posts = formatNewsFeed(rawPosts);
    const existingPosts = await prisma.post.findMany({
      where: { sourceId: { in: posts.map((post) => post.sourceId) } },
      select: { sourceId: true, title: true, content: true, summary: true },
    });
    const existingById = new Map(
      existingPosts.map((post) => [post.sourceId, post]),
    );
    const needsSummary = posts.filter((post) => {
      const existing = existingById.get(post.sourceId);
      return (
        !existing?.summary ||
        (process.env.LLM_PROVIDER === "openai" &&
          existing.summary.startsWith(MOCK_SUMMARY_PREFIX)) ||
        existing.title !== post.title ||
        existing.content !== post.content
      );
    });
    const summaries = await summarizePosts(needsSummary).catch((error) => {
      logger.warn({ event: "news_summaries_failed", err: error });
      return new Map<string, string>();
    });

    for (const post of posts) {
      const existing = existingById.get(post.sourceId);
      const unchanged =
        existing?.title === post.title && existing.content === post.content;
      const summary =
        summaries.get(post.sourceId) ?? (unchanged ? existing.summary : null);
      await prisma.post.upsert({
        where: { sourceId: post.sourceId },
        create: { ...post, summary },
        update: {
          title: post.title,
          content: post.content,
          excerpt: post.excerpt,
          imageUrl: post.imageUrl,
          publishedAt: post.publishedAt,
          summary,
        },
      });
    }
    await invalidatePostsCache();
    await backfillNewsImages().catch((error) =>
      logger.warn({ event: "news_images_failed", err: error }),
    );

    const updated = posts.filter((post) =>
      existingById.has(post.sourceId),
    ).length;
    notifyNewPosts(posts.length - updated);

    return {
      received: posts.length,
      inserted: posts.length - updated,
      updated,
      summarized: summaries.size,
    };
  } finally {
    syncing = false;
  }
}
