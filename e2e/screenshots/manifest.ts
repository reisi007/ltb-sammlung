import type { Page } from "@playwright/test";

export interface ScreenshotRoute {
  name: string;
  path: string;
  auth: boolean;
  expectedTitle: string;
  /** Optional: UI-Schritte, um einen Zustand (Tab/Dialog) zu erreichen. */
  prepare?: (page: Page) => Promise<void>;
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tab", { name }).click();
  await page.waitForTimeout(200);
}

export const routes: ScreenshotRoute[] = [
  {
    name: "login",
    path: "/login.html",
    auth: false,
    expectedTitle: "Anmelden – LTB-Sammlung",
  },
  {
    name: "collection",
    path: "/",
    auth: true,
    expectedTitle: "LTB-Sammlung",
  },
  {
    name: "specials",
    path: "/",
    auth: true,
    expectedTitle: "LTB-Sammlung",
    prepare: (page) => openTab(page, "Sonderserien"),
  },
  {
    name: "add-volume-dialog",
    path: "/",
    auth: true,
    expectedTitle: "LTB-Sammlung",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Bände hinzufügen" }).click();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "add-series-dialog",
    path: "/",
    auth: true,
    expectedTitle: "LTB-Sammlung",
    prepare: async (page) => {
      await openTab(page, "Sonderserien");
      await page.getByRole("button", { name: "Reihe hinzufügen" }).click();
      await page.waitForTimeout(200);
    },
  },
];
