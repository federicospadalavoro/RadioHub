// Backend vero, database temporaneo e sorgenti radio/notizie controllate.
import express from "express";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { config } from "../src/config.js";
import { invalidatePostsCache } from "../src/cache.js";
import { normalizeFmWorldRadios } from "../src/fm-world.js";

const database = new URL(config.databaseUrl);
if (
  database.hostname !== "127.0.0.1" ||
  database.port !== "15432" ||
  database.pathname !== "/radiohub_e2e" ||
  config.redisUrl !== "redis://127.0.0.1:16379"
)
  throw new Error(
    "I test richiedono il database temporaneo radiohub_e2e sulla porta 15432",
  );
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit" },
);

const email = "utente@radiohub.test";
const title = "Notizia di prova E2E";
let published = false;
const radios = [
  [2626, "Radio 105", "radio.mp3?station=105"],
  [2627, "Radio Jazz", "radio.mp3?station=jazz"],
  [999999, "Radio HLS", "radio.m3u8"],
].map(([id, name, file]) => ({
  id,
  name,
  logo: null,
  country: { name: "Italy" },
  categories: [{ value: "Pop" }],
  streams: [
    {
      url: `http://127.0.0.1:3100/__test/media/${file}`,
      is_video: false,
      is_online: true,
    },
  ],
}));
async function cleanup() {
  published = false;
  await prisma.user.deleteMany();
  await prisma.post.deleteMany();
  await invalidatePostsCache();
}
const testApp = express();
testApp.use(
  "/__test/media",
  (_req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    next();
  },
  express.static(
    fileURLToPath(new URL("../../frontend/e2e/media", import.meta.url)),
  ),
);
testApp.get("/api/radios/popular", (_req, res) =>
  res.json({
    radios: normalizeFmWorldRadios({ items: radios.slice(0, 2) }, 2),
  }),
);
testApp.get("/__test/info", (_req, res) => res.json({ email, title }));
testApp.get("/__test/fm", (req, res) =>
  res.json({
    items: radios.filter((radio) =>
      String(radio.name)
        .toLowerCase()
        .includes(String(req.query.query ?? "").toLowerCase()),
    ),
  }),
);
testApp.get("/__test/fm/:id", (req, res) => {
  const radio = radios.find((item) => String(item.id) === req.params.id);
  if (radio) res.json(radio);
  else res.sendStatus(404);
});
testApp.get("/__test/feed", (_req, res) =>
  res.json(
    published
      ? [
          {
            id: 1234567890,
            date_gmt: "2026-01-01T12:00:00",
            title: { rendered: title },
            content: {
              rendered:
                "Testo completo dell'articolo. Una seconda frase per il riassunto.",
            },
          },
        ]
      : [],
  ),
);
testApp.post("/__test/publish", (_req, res) => {
  published = true;
  res.sendStatus(204);
});
testApp.delete("/__test/fixtures", async (_req, res) => {
  await cleanup();
  res.sendStatus(204);
});
testApp.use(app);
const server = testApp.listen(3100, "127.0.0.1");
process.once("SIGTERM", async () => {
  server.closeAllConnections();
  await prisma.$disconnect();
  process.exit();
});
