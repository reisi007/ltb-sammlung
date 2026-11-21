import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { routes } from "./manifest";

const USER = process.env.UI_REVIEW_USER;
const PASSWORD = process.env.UI_REVIEW_PASSWORD;
const MAX_SECTIONS = 8;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login.html", { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(USER ?? "");
  await page.locator("#password").fill(PASSWORD ?? "");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });
  await page.waitForSelector("main", { state: "visible" });
  await page.waitForTimeout(500);
}

/**
 * Erfasst viewport-hohe Abschnitte (80 %-Schritt, 20 % Überlappung). Bei langen
 * Seiten werden Anfang und Ende erfasst, die Mitte bleibt bewusst ausgespart.
 */
async function captureSections(
  page: import("@playwright/test").Page,
  directory: string,
) {
  const height = page.viewportSize()?.height ?? 900;
  const total = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  const positions: number[] = [];

  for (let top = 0; top < total; top += Math.round(height * 0.8)) {
    positions.push(top);
  }

  const sampled =
    positions.length <= MAX_SECTIONS
      ? positions
      : [...positions.slice(0, 5), ...positions.slice(-3)];

  await mkdir(directory, { recursive: true });
  let index = 0;

  for (const top of sampled) {
    await page.evaluate((value) => window.scrollTo(0, value), top);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(directory, `sec${index}.png`),
      fullPage: false,
    });
    index += 1;
  }

  await writeFile(
    path.join(directory, "coverage.json"),
    `${JSON.stringify({ total, sampled }, null, 2)}\n`,
    "utf8",
  );
}

test.describe.configure({ mode: "serial" });

for (const route of routes) {
  test(`@screenshot ${route.name}`, async ({ page }, testInfo) => {
    if (!USER || !PASSWORD) {
      throw new Error("UI_REVIEW_USER und UI_REVIEW_PASSWORD müssen gesetzt sein.");
    }

    if (route.auth) {
      await login(page);
    }

    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(route.expectedTitle);
    await page.waitForTimeout(500);

    if (route.prepare !== undefined) {
      await route.prepare(page);
    }

    const directory = path.resolve(
      "test-results/ui-screenshots",
      testInfo.project.name,
      route.name,
    );

    await captureSections(page, directory);
  });
}
