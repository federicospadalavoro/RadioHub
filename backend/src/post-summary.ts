import { prisma } from "./prisma.js";
import { invalidatePostsCache } from "./cache.js";
import { summarizePosts, SummaryProviderError } from "./summary-provider.js";

type Summary = { id: string; summary: string };
const pending = new Map<string, Promise<Summary | null>>();

export function getPostSummary(id: string) {
  let request = pending.get(id);
  if (!request) {
    request = loadSummary(id).finally(() => pending.delete(id));
    pending.set(id, request);
  }
  return request;
}

async function loadSummary(id: string): Promise<Summary | null> {
  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      sourceId: true,
      title: true,
      content: true,
      summary: true,
    },
  });
  if (!post) return null;
  if (post.summary) return { id, summary: post.summary };

  const { sourceId, title, content } = post;
  const summary = (await summarizePosts([{ sourceId, title, content }]))
    .get(sourceId)
    ?.trim();
  if (!summary) throw new SummaryProviderError("Riassunto non disponibile");
  const saved = await prisma.post.updateMany({
    where: { id, title, content, summary: post.summary },
    data: { summary },
  });
  if (!saved.count) return loadSummary(id);
  await invalidatePostsCache();
  return { id, summary };
}
