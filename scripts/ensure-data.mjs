#!/usr/bin/env node
/**
 * Stellt sicher, dass der Build die generierten Datendateien findet.
 *
 * Die echten Daten (collection.json, catalog.json) sind bewusst nicht im
 * öffentlichen Repository. Für einen frischen Checkout werden beim Build
 * leere Platzhalter aus den *.example.json kopiert; `--check` verweigert das
 * und bricht ab, damit ein Deploy nie versehentlich leere Daten ausliefert.
 */
import { access, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data");
const checkOnly = process.argv.includes("--check");

const files = [
  ["collection.json", "collection.example.json"],
  ["catalog.json", "catalog.example.json"],
];

let missing = false;

for (const [targetName, exampleName] of files) {
  const target = resolve(dataDir, targetName);

  try {
    await access(target);
  } catch {
    if (checkOnly) {
      console.error(
        `FEHLER: src/data/${targetName} fehlt. Bitte zuerst ` +
          "`npm run sync:data` bzw. `npm run sync:catalog` ausführen.",
      );
      missing = true;
    } else {
      await copyFile(resolve(dataDir, exampleName), target);
      console.info(
        `src/data/${targetName} fehlte — Platzhalter aus ${exampleName} kopiert.`,
      );
    }
  }
}

if (missing) {
  process.exitCode = 1;
}
