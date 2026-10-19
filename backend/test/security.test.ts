import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_RATE_LIMIT = "2";
  process.env.AI_RATE_LIMIT = "2";
  process.env.CORS_ORIGINS = "http://localhost:5173";
});
import { app } from "../src/app.js";

describe("Protezioni API", () => {
  it("applica Helmet e non espone Express", async () => {
    const response = await request(app).get("/api/health");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).toBeTruthy();
  });

  it("consente il frontend configurato e blocca anche i POST da origini estranee", async () => {
    const allowed = await request(app)
      .options("/api/auth/refresh")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    const blocked = await request(app)
      .post("/api/auth/logout")
      .set("Origin", "https://estraneo.test");
    expect(blocked.status).toBe(403);
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rifiuta JSON invalido o troppo grande", async () => {
    const broken = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{");
    expect(broken.status).toBe(400);
    const large = await request(app)
      .post("/api/news/ask")
      .send({ question: "x".repeat(20_000) });
    expect(large.status).toBe(413);
  });

  it("limita i tentativi di accesso senza bloccare la lettura pubblica", async () => {
    for (let i = 0; i < 2; i++) {
      expect(
        (await request(app).post("/api/auth/register").send({})).status,
      ).toBe(400);
    }
    const limited = await request(app).post("/api/auth/register").send({});
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeTruthy();
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  it("condivide il limite AI tra ricerca radio e domande sulle notizie", async () => {
    expect(
      (await request(app).post("/api/radios/interpret").send({})).status,
    ).toBe(400);
    expect((await request(app).post("/api/news/ask").send({})).status).toBe(
      400,
    );
    expect((await request(app).post("/api/news/ask").send({})).status).toBe(
      429,
    );
  });
});
