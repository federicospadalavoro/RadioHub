import { isNewsSyncRunning, syncNewsFeed } from "./news-sync.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { prisma } from "./prisma.js";

export function startNewsSyncJob() {
  const synchronize = async () => {
    if (isNewsSyncRunning()) return;

    try {
      const result = await syncNewsFeed();
      logger.info({ event: "news_sync_completed", ...result });
    } catch (error) {
      logger.error({ event: "news_sync_failed", err: error });
    }
  };
  // Primo avvio: importa notizie vere soltanto se la tabella è vuota.
  void prisma.post
    .count()
    .then((count) => {
      if (count === 0) return synchronize();
    })
    .catch((err) => logger.error({ event: "news_initialization_failed", err }));
  return setInterval(synchronize, config.newsSyncIntervalMs);
}
