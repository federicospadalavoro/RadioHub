import { prisma } from "./prisma.js";
import { summarizePosts } from "./summary-provider.js";
import { invalidatePostsCache } from "./cache.js";
import { notifyNewPosts } from "./news-events.js";

const NEWS_FEED_URL =
  process.env.NEWS_FEED_URL ?? "https://d3r6kmd22dkoyn.cloudfront.net/";
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
};

type PostData = {
  sourceId: string;
  title: string;
  content: string;
  excerpt: string | null;
  publishedAt: Date | null;
};

export async function fetchNewsFeed(): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(NEWS_FEED_URL, {
      signal: AbortSignal.timeout(10_000),
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
      publishedAt: parsePublishedAt(post.date_gmt, post.date),
    };
  });
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
        existing.title !== post.title ||
        existing.content !== post.content
      );
    });
    const summaries = await summarizePosts(needsSummary);

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
          publishedAt: post.publishedAt,
          summary,
        },
      });
    }
    await invalidatePostsCache();

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
