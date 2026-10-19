import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --import tsx ../frontend/e2e/server.ts",
      cwd: fileURLToPath(new URL("../backend", import.meta.url)),
      url: "http://127.0.0.1:3100/api/health",
      env: {
        NODE_ENV: "test",
        PORT: "3100",
        LLM_PROVIDER: "mock",
        JWT_SECRET: "test-only-radiohub-e2e-secret",
        ACCESS_TOKEN_SECONDS: "2",
        AUTH_RATE_LIMIT: "100",
        CORS_ORIGINS: "http://127.0.0.1:5174",
        NEWS_FEED_URL: "http://127.0.0.1:3100/__test/feed",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      env: { API_PROXY_TARGET: "http://127.0.0.1:3100" },
    },
  ],
});
