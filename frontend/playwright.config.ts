import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" },
    },
  ],
  webServer: [
    {
      command: "node --import tsx test/e2e-server.ts",
      cwd: fileURLToPath(new URL("../backend", import.meta.url)),
      url: "http://127.0.0.1:3100/api/health",
      env: {
        NODE_ENV: "test",
        PORT: "3100",
        DATABASE_URL:
          "postgresql://radiohub_e2e:test-only@127.0.0.1:15432/radiohub_e2e",
        REDIS_URL: "redis://127.0.0.1:16379",
        LLM_PROVIDER: "mock",
        AI_API_KEY: "",
        FM_WORLD_TOKEN: "test-only",
        FM_WORLD_URL: "http://127.0.0.1:3100/__test/fm",
        LOG_LEVEL: "silent",
        COOKIE_SECURE: "false",
        TRUST_PROXY: "0",
        JWT_SECRET: "test-only-radiohub-e2e-secret",
        ACCESS_TOKEN_SECONDS: "3",
        AUTH_RATE_LIMIT: "100",
        API_RATE_LIMIT: "10000",
        AI_RATE_LIMIT: "1000",
        PASSWORD_HASH_ROUNDS: "10",
        CORS_ORIGINS: "http://127.0.0.1:5174",
        NEWS_FEED_URL: "http://127.0.0.1:3100/__test/feed",
      },
    },
    {
      command:
        "npm run build && npx vite preview --host 127.0.0.1 --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      env: { API_PROXY_TARGET: "http://127.0.0.1:3100" },
    },
  ],
});
