import type { RequestHandler, Response } from "express";
import { config } from "./config.js";

const clients = new Set<Response>();

export const subscribeToNews: RequestHandler = (_req, res) => {
  if (clients.size >= config.sseMaxClients) {
    res.status(503).json({ error: "Troppe connessioni in tempo reale" });
    return;
  }
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`retry: ${config.sseRetryMs}\n\n`);
  clients.add(res);
  const heartbeat = setInterval(
    () => res.write(": heartbeat\n\n"),
    config.sseHeartbeatMs,
  );
  res.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
};

export function notifyNewPosts(inserted: number) {
  if (!inserted) return;
  const event = `event: news\ndata: ${JSON.stringify({ inserted })}\n\n`;
  for (const client of clients) {
    if (!client.write(event)) client.end();
  }
}
