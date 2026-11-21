import tailwindcss from "@tailwindcss/vite";
import { lingui } from "@lingui/vite-plugin";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import {
  defineConfig,
  type IndexHtmlTransformContext,
  type Plugin,
} from "vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

const base = process.env.BASE_PATH ?? "/ltb-sammlung/";

/**
 * CSP als <meta>-Tag im Produktions-Build. `style-src 'unsafe-inline'` ist
 * wegen der React-style-Attribute in Cover.tsx/SeriesCover.tsx noetig;
 * `frame-ancestors` bleibt im Caddy-Header, Browser ignorieren es in <meta>.
 */
export const CSP_POLICY =
  "default-src 'self'; img-src 'self' https: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";

/**
 * Der eigentliche Hook, damit er ohne DOM und ohne Plugin-Container testbar
 * ist. Im Dev-Modus injiziert @vitejs/plugin-react ein Inline-Script fuer
 * React Refresh; ein bundle === undefined kennzeichnet den Dev-Kontext, in
 * dem die CSP nicht injiziert wird (sonst waere das Inline-Script blockiert).
 */
export function cspIndexHtmlHook(
  html: string,
  context: IndexHtmlTransformContext
): string {
  if (context.bundle === undefined) {
    return html;
  }

  const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}" />`;

  return html.replace("</head>", `${meta}\n  </head>`);
}

export function cspMetaPlugin(): Plugin {
  return {
    name: "ltb-csp-meta",
    transformIndexHtml: {
      order: "post",
      handler: cspIndexHtmlHook,
    },
  };
}

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
        // Alte Precache-Eintraege (z. B. ein frueher gebuendelter
        // Sammlungs-Snapshot) werden beim Aktivieren entfernt.
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/api\//, /\/login\.html/],
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
    cspMetaPlugin(),
  ],
});
