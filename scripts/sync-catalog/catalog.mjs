import { readFile } from "node:fs/promises";
import { OUTPUT_FILE, SERIES_ALIASES } from "./constants.mjs";
import { normalizeIsbnValue } from "./isbn.mjs";

/**
 * Vorhandene, bereits geprüfte ISBNs aus dem letzten Katalog. Sie bleiben
 * erhalten, solange die Anreicherung ausgeschaltet ist.
 */
export async function previousCatalogIsbns() {
  const isbns = new Map();

  try {
    const previous = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));

    for (const entry of Array.isArray(previous.entries) ? previous.entries : []) {
      const isbn = normalizeIsbnValue(entry?.isbn);

      if (isbn !== null && Number.isSafeInteger(entry.number)) {
        isbns.set(entry.number, isbn);
      }
    }
  } catch {
    return isbns;
  }

  return isbns;
}

export async function previousCatalogStats() {
  try {
    const previous = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));

    if (!Array.isArray(previous.entries)) {
      return null;
    }

    const series = {};

    if (previous.series !== null && typeof previous.series === "object") {
      for (const [name, entries] of Object.entries(previous.series)) {
        const canonical = SERIES_ALIASES[name.toLowerCase()] ?? name;
        const count = Array.isArray(entries) ? entries.length : 0;

        series[canonical] = Math.max(series[canonical] ?? 0, count);
      }
    }

    return {
      entries: previous.entries.length,
      titles: previous.entries.filter((entry) => entry.title !== null).length,
      covers: previous.entries.filter((entry) => entry.coverUrl !== null).length,
      series,
    };
  } catch {
    return null;
  }
}
