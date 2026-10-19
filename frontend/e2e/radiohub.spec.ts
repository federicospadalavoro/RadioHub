import { test, expect } from "@playwright/test";

const backend = "http://127.0.0.1:3100";
const password = "Password-test-123";
test.afterEach(async ({ request }) => {
  expect(
    (await request.delete(`${backend}/__test/fixtures`)).ok(),
  ).toBeTruthy();
});

test("registrazione → cerca → ascolta → preferiti, con rinnovo automatico", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const { email } = await (await request.get(`${backend}/__test/info`)).json();
  await page.goto("/");
  await page.getByRole("button", { name: "Vai alla registrazione" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const registration = page.waitForResponse("**/api/auth/register");
  await page.getByRole("button", { name: "Crea account" }).click();
  const { token } = await (await registration).json();
  await expect(page.getByText(`Accesso: ${email}`)).toBeVisible();
  await page.getByLabel("Cerca una radio", { exact: true }).fill("Radio 105");
  const radio = page.locator('[data-radio-id="2626"]');
  await expect(radio).toBeVisible();
  const audio = radio.locator("audio");
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(() =>
      audio.evaluate(
        (element: HTMLAudioElement) =>
          !element.paused && element.currentTime > 0,
      ),
    )
    .toBeTruthy();

  await expect
    .poll(async () =>
      (
        await request.get("/api/favorites", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status(),
    )
    .toBe(401);
  const refresh = page.waitForResponse("**/api/auth/refresh");
  await radio.getByRole("button", { name: "Aggiungi ai preferiti" }).click();
  expect((await refresh).status()).toBe(200);
  await expect(
    radio.getByRole("button", { name: "Rimuovi dai preferiti" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preferiti", exact: true }).click();
  await expect(page.locator('[data-favorite-id="2626"]')).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Accesso: ${email}`)).toBeVisible();
  await page.getByRole("button", { name: "Preferiti", exact: true }).click();
  await expect(page.locator('[data-favorite-id="2626"]')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  await page.getByRole("button", { name: "Esci", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Accedi", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Accedi", exact: true }),
  ).toBeEnabled();
});

test("riproduce uno stream HLS audio reale di FM-World", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByLabel("Cerca una radio", { exact: true }).fill("rock");
  const audio = page.locator('[data-radio-id="110504"] audio');
  await expect(audio).toBeVisible({ timeout: 15_000 });
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(
      () =>
        audio.evaluate(
          (element: HTMLAudioElement) =>
            !element.paused && element.currentTime > 0,
        ),
      { timeout: 15_000 },
    )
    .toBeTruthy();
});

test("la sync notifica i nuovi post con SSE e aggiorna la pagina", async ({
  page,
  request,
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
  await expect(page.getByRole("status")).toHaveText("Nuove notizie: 1");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  expect((await (await request.post("/api/sync")).json()).inserted).toBe(0);
});

test("refresh ruotato, cookie protetto e logout che revoca anche l'accesso", async ({
  request,
}) => {
  const { email } = await (await request.get(`${backend}/__test/info`)).json();
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
  const authorization = { Authorization: `Bearer ${token}` };
  expect(
    (await request.get("/api/favorites", { headers: authorization })).ok(),
  ).toBeTruthy();
  expect((await request.post("/api/auth/logout")).status()).toBe(204);
  expect(
    (await request.get("/api/favorites", { headers: authorization })).status(),
  ).toBe(401);
  expect((await request.post("/api/auth/refresh")).status()).toBe(401);
});
