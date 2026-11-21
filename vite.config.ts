import tailwindcss from "@tailwindcss/vite";
import { lingui } from "@lingui/vite-plugin";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

const base = process.env.BASE_PATH ?? "/ltb-sammlung/";

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        login: resolve(process.cwd(), "login.html"),
      },
    },
  },
  plugins: [
    react(),
    lingui({ macroTransform: true }),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg", "icon-maskable.svg", "icons/*.png"],
      manifest: {
        name: "LTB-Sammlung",
        short_name: "LTB",
        description:
          "Persönliche Übersicht meiner Lustiges-Taschenbuch-Sammlung",
        lang: "de",
        theme_color: "#123c4a",
        background_color: "#123c4a",
        display: "standalone",
        orientation: "portrait",
        start_url: base,
        scope: base,
        icons: [
          {
            src: "icons/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/api\//, /\/login\.html$/],
        runtimeCaching: [
          {
            // Cover nur zur Laufzeit cachen; es wird nichts mitgeliefert.
            urlPattern:
              /^https:\/\/(de\.duckipedia\.org|www\.lustiges-taschenbuch\.de)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "cover-images",
              expiration: {
                maxEntries: 900,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
});
