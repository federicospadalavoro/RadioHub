// Server dei test: feed notizie controllato, radio FM-World reali, nessun job periodico.
import { app } from "../../backend/src/app.js";
import { prisma } from "../../backend/src/prisma.js";
import { invalidatePostsCache } from "../../backend/src/cache.js";

const id = Date.now();
const email = `e2e-${id}@radiohub.test`;
const title = `Notizia E2E ${id}`;
let published = false;
async function cleanup() {
  published = false;
  await prisma.user.deleteMany({ where: { email } });
  await prisma.post.deleteMany({ where: { sourceId: String(id) } });
  await invalidatePostsCache();
}
app.get("/__test/info", (_req, res) => res.json({ email, title }));
app.get("/__test/feed", (_req, res) =>
  res.json(
    published
      ? [
          {
            id,
            date_gmt: new Date().toISOString(),
            title: { rendered: title },
            content: { rendered: "Contenuto della notizia di test." },
          },
        ]
      : [],
  ),
);
app.post("/__test/publish", (_req, res) => {
  published = true;
  res.sendStatus(204);
});
app.delete("/__test/fixtures", async (_req, res) => {
  await cleanup();
  res.sendStatus(204);
});
const server = app.listen(Number(process.env.PORT), "127.0.0.1");
process.once("SIGTERM", async () => {
  server.closeAllConnections();
  await cleanup();
  await prisma.$disconnect();
  process.exit();
});
