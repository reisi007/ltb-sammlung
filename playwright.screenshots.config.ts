import { defineConfig, devices } from "@playwright/test";

/**
 * Screenshot-Harness für den UI-Review (getrennt von einem normalen
 * E2E-Suite-Lauf). Aufruf:
 *
 *   UI_REVIEW_USER=admin UI_REVIEW_PASSWORD=… npm run test:screenshots
 *
 * Standardziel ist die Live-Seite; für lokal `UI_REVIEW_BASE_URL` setzen.
 */
export default defineConfig({
  testDir: "./e2e/screenshots",
  testMatch: "**/*.spec.ts",
  // Dieser Lauf geht gegen die Live-Instanz und darf nur lesen. Schreibende
  // Ablaufe bekommen einen eigenen Namen (mutation-*.spec.ts) und werden hier
  // bewusst ignoriert.
  testIgnore: "**/mutation-*.spec.ts",
  // Parallellauf gegen die Live-Instanz: 16 Tests, 18 CPUs.
  // Gemessen (retries: 0, maxFailures: 0): seriell 59,4 s, 4 Worker 16,3 s,
  // 8 Worker 9,6 s, 12 Worker 8,3 s — alle 16/16 grün, keine Kollisionen.
  // 8 Worker als Default; jeder Test schreibt in <project>/<route> und die
  // Suite ist read-only, daher ist kein Named Lock nötig.
  fullyParallel: true,
  workers: 8,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  outputDir: "test-results/ui-screenshots",
  use: {
    baseURL: process.env.UI_REVIEW_BASE_URL ?? "https://ltb.all-the.rest",
    // Die Quelle der UI ist Deutsch; ohne feste Locale wuerde der Browser
    // (en-US) die englischen Texte zeigen und die Selektor-Namen wechseln.
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["Galaxy A55"], viewport: { width: 412, height: 915 } },
    },
  ],
});
