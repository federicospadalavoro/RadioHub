import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL("..", import.meta.url));
  const env = loadEnv(mode, envDir, "");
  const port = Number(env.FRONTEND_PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("FRONTEND_PORT deve essere tra 1 e 65535");
  const proxy = {
    "/api": env.API_PROXY_TARGET || `http://127.0.0.1:${env.PORT ?? 3000}`,
  };
  return {
    envDir,
    plugins: [
      VitePWA({
        registerType: "prompt",
        manifest: {
          id: "/",
          name: "RadioHub",
          short_name: "RadioHub",
          description: "Radio in diretta, preferiti e notizie.",
          lang: "it",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#edf2f8",
          theme_color: "#edf2f8",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            {
              src: "/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
    server: {
      port,
      strictPort: true,
      proxy,
    },
    preview: { proxy },
  };
});
