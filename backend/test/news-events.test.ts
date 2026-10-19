import { once } from "node:events";
import { expect, it } from "vitest";
import { app } from "../src/app.js";
import { notifyNewPosts } from "../src/news-events.js";

it("invia un evento SSE soltanto quando sono stati inseriti nuovi post", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Server non avviato");
  const controller = new AbortController();
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/posts/events`,
      { signal: controller.signal },
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toContain("retry:");
    notifyNewPosts(0);
    notifyNewPosts(2);
    const message = decoder.decode((await reader.read()).value);
    expect(message).toContain("event: news");
    expect(message).toContain('"inserted":2');
    controller.abort();
    await reader.cancel().catch(() => undefined);
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
