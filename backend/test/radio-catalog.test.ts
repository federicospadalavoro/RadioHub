import request from "supertest";
import { expect, it } from "vitest";
import { app } from "../src/app.js";

it("mostra cento emittenti distinte in ordine di ascolti senza autenticazione", async () => {
  const response = await request(app).get("/api/radios/popular");
  expect(response.status).toBe(200);
  const { radios, sourceUrl } = response.body;
  expect(sourceUrl).toContain("Audiradio-Dati-Anno-2025.pdf");
  expect(radios).toHaveLength(100);
  expect(new Set(radios.map((r: { id: string }) => r.id)).size).toBe(100);
  expect(radios.slice(0, 5).map((r: { id: string }) => r.id)).toEqual([
    "3534",
    "2980",
    "3484",
    "2831",
    "2626",
  ]);
  for (const [index, radio] of radios.entries()) {
    expect(radio.rank).toBe(index + 1);
    expect(radio.country).toBe("Italy");
    expect(radio.streamUrl).toMatch(/^https?:\/\//);
    expect(radio.listeners).toBeLessThanOrEqual(
      radios[Math.max(index - 1, 0)].listeners,
    );
  }
});
