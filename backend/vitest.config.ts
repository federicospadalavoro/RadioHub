import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
      REDIS_URL: "redis://127.0.0.1:1",
      LLM_PROVIDER: "mock",
      AI_API_KEY: "test-key",
      FM_WORLD_TOKEN: "test-token",
      JWT_SECRET: "test-secret-not-used-in-production",
      LOG_LEVEL: "silent",
      CACHE_TTL_SECONDS: "300",
      SERVICE_TIMEOUT_MS: "3000",
      AI_TIMEOUT_MS: "30000",
      AI_MAX_CONTENT_CHARS: "12000",
      API_RATE_LIMIT: "1000",
      AI_RATE_LIMIT: "1000",
    },
  },
});
