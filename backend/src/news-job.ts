import { isNewsSyncRunning, syncNewsFeed } from "./news-sync.js";

const interval = 5 * 60 * 1000;

export function startNewsSyncJob() {
  return setInterval(async () => {
    if (isNewsSyncRunning()) return;

    try {
      const result = await syncNewsFeed();
      console.log("Sincronizzazione notizie completata", result);
    } catch (error) {
      console.error("Sincronizzazione notizie fallita", error);
    }
  }, interval);
}
