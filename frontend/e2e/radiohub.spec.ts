import { test, expect, type Page } from "@playwright/test";

const backend = "http://127.0.0.1:3100";
const email = "utente@radiohub.test";
const password = "Password-test-123";
const audio = (page: Page) => page.locator("audio");
const station = (page: Page, id = "2626") =>
  page.locator(`[data-radio-id="${id}"]`);
async function showPlayer(page: Page, mobile: boolean) {
  if (mobile)
    await page.getByRole("button", { name: "Apri il player" }).click();
}
async function showNews(page: Page, mobile: boolean) {
  if (mobile)
    await page
      .getByRole("navigation", { name: "Navigazione mobile" })
      .getByRole("button", { name: "Notizie" })
      .click();
  else await page.getByRole("button", { name: "Vedi tutte" }).click();
}
async function expectPlaying(page: Page) {
  await expect
    .poll(() =>
      audio(page).evaluate(
        (element: HTMLAudioElement) =>
          !element.paused && element.currentTime > 0,
      ),
    )
    .toBeTruthy();
  await expect(page.getByRole("img", { name: "In riproduzione" })).toHaveCount(
    1,
  );
}

test.beforeEach(async ({ context, request }) => {
  expect(
    (await request.delete(`${backend}/__test/fixtures`)).ok(),
  ).toBeTruthy();
  await context.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return ["127.0.0.1", "localhost"].includes(host)
      ? route.continue()
      : route.abort();
  });
});

test("registrazione → cerca → ascolta → preferiti e rinnovo automatico", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await page
    .getByRole("button", { name: "Non hai un account? Registrati" })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const registration = page.waitForResponse("**/api/auth/register");
  await page.getByRole("button", { name: "Crea account" }).click();
  const response = await registration;
  expect(response.status()).toBe(201);
  const { token } = await response.json();
  await expect(page.locator(".account summary")).toBeVisible();
  await page.getByLabel("Cerca una radio", { exact: true }).fill("Radio 105");
  await station(page)
    .getByRole("button", { name: "Ascolta Radio 105" })
    .click();
  await expectPlaying(page);
  await expect(audio(page)).toHaveCount(1);
  await expect
    .poll(
      async () =>
        (
          await request.get("/api/favorites", {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status(),
      { timeout: 7000 },
    )
    .toBe(401);
  const refresh = page.waitForResponse("**/api/auth/refresh");
  await station(page)
    .getByRole("button", { name: "Aggiungi ai preferiti" })
    .click();
  expect((await refresh).status()).toBe(200);
  await expect(
    station(page).getByRole("button", { name: "Rimuovi dai preferiti" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Preferite", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancella ricerca" }).click();
  await expect(
    page.getByRole("heading", { name: "Le tue radio", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-favorite-id="2626"]')).toHaveCount(1);
  await expect(page.locator(".station-list > article").first()).toHaveAttribute(
    "data-favorite-id",
    "2626",
  );
  await page.reload();
  await expect(page.locator('[data-favorite-id="2626"]')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  await page.locator(".account summary").click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Esci dall’account" }).click();
  await expect(
    page.getByRole("button", { name: "Accedi", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Accedi", exact: true }),
  ).toBeVisible();
});

test("login rifiutato con password errata e riuscito con quella corretta", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.post("/api/auth/register", { data: { email, password } })
    ).status(),
  ).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Password-sbagliata");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Email o password non corretti",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".account summary")).toBeVisible();
});

test("player unico: cambio radio, pausa e mini player nelle notizie", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await station(page)
    .getByRole("button", { name: "Ascolta Radio 105" })
    .click();
  await expectPlaying(page);
  await station(page, "2627")
    .getByRole("button", { name: "Ascolta Radio Jazz" })
    .click();
  await expectPlaying(page);
  await expect(audio(page)).toHaveCount(1);
  await expect(audio(page)).toHaveAttribute("src", /station=jazz/);
  await showNews(page, isMobile);
  const mini = page.getByRole("contentinfo", { name: "Controlli radio" });
  await expect(mini).toBeVisible();
  await mini.getByRole("button", { name: "Metti in pausa" }).click();
  await expect
    .poll(() =>
      audio(page).evaluate((element: HTMLAudioElement) => element.paused),
    )
    .toBe(true);
  await mini.getByRole("button", { name: "Riproduci radio" }).click();
  await expect
    .poll(() =>
      audio(page).evaluate((element: HTMLAudioElement) => !element.paused),
    )
    .toBe(true);
  if (isMobile) {
    await showPlayer(page, true);
    await expect(
      page.getByRole("heading", { name: "Radio Jazz", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Riduci il player" }).click();
    await expect(
      mini.getByRole("button", { name: "Apri il player" }),
    ).toBeVisible();
  }
});

test("riproduce uno stream HLS controllato nel player unico", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Cerca una radio", { exact: true }).fill("Radio HLS");
  await station(page, "999999")
    .getByRole("button", { name: "Ascolta Radio HLS" })
    .click();
  await expectPlaying(page);
  await expect(audio(page)).toHaveCount(1);
});

test("sync → SSE → articolo completo → riassunto al posto del testo", async ({
  page,
  request,
  isMobile,
}) => {
  const { title } = await (await request.get(`${backend}/__test/info`)).json();
  const stream = page.waitForResponse("**/api/posts/events");
  await page.goto("/");
  expect((await stream).headers()["content-type"]).toContain(
    "text/event-stream",
  );
  await request.post(`${backend}/__test/publish`);
  const sync = await request.post("/api/sync");
  expect(sync.ok()).toBeTruthy();
  expect((await sync.json()).inserted).toBe(1);
  await showNews(page, isMobile);
  await expect(
    page.getByText("Nuove notizie: 1", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Leggi la notizia: ${title}` })
    .click();
  const article = page.locator(".news-fulltext");
  await expect(article).toContainText("Testo completo dell'articolo.");
  const summary = page.waitForResponse("**/api/posts/*/summary");
  await page.getByRole("button", { name: "Riassumi", exact: true }).click();
  expect((await summary).status()).toBe(200);
  await expect(article).toContainText("Riassunto dimostrativo (mock):");
  await expect(page.locator(".news-fulltext")).toHaveCount(1);
  await page.getByRole("button", { name: "Testo completo" }).click();
  await expect(article).not.toContainText("Riassunto dimostrativo (mock):");
  await page.getByLabel("Filtra per titolo").fill("inesistente");
  await expect(page.getByText("Nessuna notizia trovata.")).toBeVisible();
  expect((await (await request.post("/api/sync")).json()).inserted).toBe(0);
});

test("link condiviso recupera e avvia una radio fuori dal catalogo", async ({
  page,
  isMobile,
}) => {
  await page.goto("/#radio=999999");
  await expect(station(page, "999999")).toBeVisible();
  await expect(audio(page)).toHaveCount(1);
  await expect(page.locator(".app-shell")).not.toHaveClass(/startup-hidden/);
  await expect
    .poll(() => page.locator(".player-status").textContent())
    .toMatch(/In diretta|Tocca play per avviare la radio\./);
  if (
    (await page.locator(".player-status").textContent())?.trim() ===
    "In diretta"
  )
    await expectPlaying(page);
  await showPlayer(page, isMobile);
  await expect(
    page.getByRole("heading", { name: "Radio HLS", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as Window & { sharedUrl?: string }).sharedUrl = data.url;
      },
    }),
  );
  await page.getByRole("button", { name: "Condividi radio" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { sharedUrl?: string }).sharedUrl,
      ),
    )
    .toBe("http://127.0.0.1:5174/#radio=999999");
});

test("refresh ruotato, cookie HttpOnly e logout che revoca l'accesso", async ({
  request,
}) => {
  const registration = await request.post("/api/auth/register", {
    data: { email, password },
  });
  expect(registration.status()).toBe(201);
  const cookie = registration.headers()["set-cookie"]!;
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  const oldCookie = cookie.split(";")[0]!;
  const rotations = await Promise.all(
    [1, 2].map(() =>
      request.post("/api/auth/refresh", { headers: { Cookie: oldCookie } }),
    ),
  );
  expect(rotations.map((response) => response.status()).sort()).toEqual([
    200, 401,
  ]);
  const refreshed = rotations.find((response) => response.ok())!;
  const { token } = await refreshed.json();
  expect(refreshed.headers()["set-cookie"]!.split(";")[0]).not.toBe(oldCookie);
  expect(
    (
      await request.post("/api/auth/refresh", {
        headers: { Cookie: oldCookie },
      })
    ).status(),
  ).toBe(401);
  const headers = { Authorization: `Bearer ${token}` };
  expect((await request.get("/api/favorites", { headers })).status()).toBe(200);
  expect((await request.post("/api/auth/logout")).status()).toBe(204);
  expect((await request.get("/api/favorites", { headers })).status()).toBe(401);
  expect((await request.post("/api/auth/refresh")).status()).toBe(401);
});

test("PWA: manifest, icone e interfaccia riaperta senza rete", async ({
  page,
  request,
  context,
}) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "RadioHub",
    display: "standalone",
    start_url: "/",
  });
  for (const icon of manifest.icons)
    expect((await request.get(icon.src)).ok()).toBeTruthy();
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.active),
      ),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "RadioHub", exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});
