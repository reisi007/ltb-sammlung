#!/usr/bin/env node
/**
 * Stellt sicher, dass der Build die generierten Datendateien findet.
 *
 * Die echten Daten (collection.json, catalog.json) sind bewusst nicht im
 * öffentlichen Repository. Für einen frischen Checkout werden beim Build
 * leere Platzhalter aus den *.example.json kopiert; `--check` prüft, dass
 * echte Daten vorliegen, damit ein Deploy nie versehentlich leere Daten
 * ausliefert.
 */
import { access, copyFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data");
const checkOnly = process.argv.includes("--check");

const files = [
  {
    target: "collection.json",
    example: "collection.example.json",
    hint: "npm run sync:data",
    // Mindestinhalt, den ein Platzhalter nicht hat.
    isReal: (data) =>
      Array.isArray(data?.ltb) &&
      data.ltb.length > 0 &&
      Array.isArray(data?.specials) &&
      data.specials.length > 0,
  },
  {
    target: "catalog.json",
    example: "catalog.example.json",
    hint: "npm run sync:catalog",
    isReal: (data) =>
      Array.isArray(data?.entries) && data.entries.length > 0,
  },
];

let failed = false;

for (const file of files) {
  const target = resolve(dataDir, file.target);

  try {
    await access(target);
  } catch {
    if (checkOnly) {
      console.error(
        `FEHLER: src/data/${file.target} fehlt. Bitte zuerst ` +
          `\`${file.hint}\` ausführen.`,
      );
      failed = true;
      continue;
    }

    await copyFile(resolve(dataDir, file.example), target);
    console.info(
      `src/data/${file.target} fehlte — Platzhalter aus ${file.example} kopiert.`,
    );
    continue;
  }

  if (!checkOnly) {
    continue;
  }

  let data;

  try {
    data = JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    console.error(
      `FEHLER: src/data/${file.target} ist kein gültiges JSON: ` +
        (error instanceof Error ? error.message : String(error)),
    );
    failed = true;
    continue;
  }

  if (!file.isReal(data)) {
    console.error(
      `FEHLER: src/data/${file.target} enthält nur Platzhalterdaten. ` +
        `Bitte \`${file.hint}\` ausführen.`,
    );
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
}
