import {
  BATCH_PAUSE_MS,
  EGMONT_MAIN_SERIES_PATTERN,
  EGMONT_SITEMAP_URL,
} from "./constants.mjs";
import { errorMessage, fetchHtml, sleep } from "./http.mjs";
import { parseEgmontProductState } from "./html.mjs";

/**
 * Normalisiert ISBN-10/ISBN-13 auf eine gültige ISBN-13. Bewusst eine kleine
 * eigene Kopie von `src/lib/isbn.ts`: dieses Script laeuft direkt unter Node
 * und kann die TypeScript-Datei nicht importieren. Alles andere ergibt null.
 */
export function normalizeIsbnValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toUpperCase().replace(/[^0-9X]/g, "");

  if (/^\d{9}[\dX]$/.test(normalized)) {
    let sum = 0;

    for (let index = 0; index < 10; index += 1) {
      const digit = normalized[index] === "X" ? 10 : Number(normalized[index]);
      sum += digit * (10 - index);
    }

    if (sum % 11 !== 0) {
      return null;
    }

    const core = `978${normalized.slice(0, 9)}`;
    let check = 0;

    for (let index = 0; index < 12; index += 1) {
      check += Number(core[index]) * (index % 2 === 0 ? 1 : 3);
    }

    return `${core}${(10 - (check % 10)) % 10}`;
  }

  if (/^97[89]\d{10}$/.test(normalized)) {
    let sum = 0;

    for (let index = 0; index < 12; index += 1) {
      sum += Number(normalized[index]) * (index % 2 === 0 ? 1 : 3);
    }

    return Number(normalized[12]) === (10 - (sum % 10)) % 10
      ? normalized
      : null;
  }

  return null;
}

/**
 * Liest die ISBN einer Egmont-Produktseite. Der Produktname muss die Bandnummer
 * exakt nennen, sonst gilt die Seite als nicht zugeordnet.
 */
export function parseEgmontIsbn(html, number) {
  const product = parseEgmontProductState(html);

  if (product === null || typeof product.name !== "string") {
    return null;
  }

  const expected = new RegExp(`^Lustiges Taschenbuch Nr\\. ${number}(?:\\D|$)`);

  if (!expected.test(product.name)) {
    return null;
  }

  const specs = Array.isArray(product.specs) ? product.specs : [];
  const isbnSpec = specs.find((spec) => spec?.key === "ISBN");
  const fromSpecs = normalizeIsbnValue(isbnSpec?.value);

  if (fromSpecs !== null) {
    return fromSpecs;
  }

  const jsonLd =
    /<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/i.exec(html);

  if (jsonLd === null) {
    return null;
  }

  try {
    const data = JSON.parse(jsonLd[1]);

    return normalizeIsbnValue(data?.gtin13);
  } catch {
    return null;
  }
}

/**
 * Sammelt ISBNs der Hauptreihe aus dem Egmont-Shop. Eine Nummer bekommt nur
 * dann eine ISBN, wenn alle gefundenen Produktseiten dieselbe gültige ISBN
 * nennen; mehrere verschiedene ISBNs werden übersprungen.
 */
export async function collectEgmontIsbns(numbers) {
  const wanted = new Set(numbers);
  const sitemap = await fetchHtml(EGMONT_SITEMAP_URL, "Egmont-Sitemap");
  const urlsByNumber = new Map();
  EGMONT_MAIN_SERIES_PATTERN.lastIndex = 0;
  let match = EGMONT_MAIN_SERIES_PATTERN.exec(sitemap);

  while (match !== null) {
    const number = Number.parseInt(match[2], 10);

    if (wanted.has(number)) {
      const urls = urlsByNumber.get(number) ?? [];

      if (!urls.includes(match[1])) {
        urls.push(match[1]);
      }

      urlsByNumber.set(number, urls);
    }

    match = EGMONT_MAIN_SERIES_PATTERN.exec(sitemap);
  }

  if (urlsByNumber.size === 0) {
    throw new Error(
      "Egmont-Sitemap enthält keine Produktseiten der LTB-Hauptreihe. " +
        "Es wurde nichts geschrieben.",
    );
  }

  const isbns = new Map();
  let failed = 0;
  let checked = 0;

  for (const number of [...urlsByNumber.keys()].sort((a, b) => a - b)) {
    const found = new Set();

    for (const url of urlsByNumber.get(number)) {
      try {
        const html = await fetchHtml(url, `Egmont ISBN ${number}`);
        const isbn = parseEgmontIsbn(html, number);

        if (isbn !== null) {
          found.add(isbn);
        }
      } catch (error) {
        failed += 1;
        console.info(
          `Egmont ISBN ${number}: Seite nicht lesbar (${errorMessage(error)}).`,
        );
      }

      await sleep(BATCH_PAUSE_MS);
    }

    if (found.size === 1) {
      isbns.set(number, [...found][0]);
    } else if (found.size > 1) {
      console.info(
        `Egmont ISBN ${number}: mehrere ISBNs (${[...found].join(", ")}), ` +
          "wird übersprungen.",
      );
    }

    checked += 1;

    if (checked % 50 === 0) {
      console.info(
        `Egmont ISBN: ${checked} Nummern geprüft, ${isbns.size} ISBN gefunden.`,
      );
    }
  }

  if (failed > 0) {
    console.info(
      `${failed} Egmont-Produktseiten waren nicht lesbar; betroffene Nummern ` +
        "bleiben ohne ISBN.",
    );
  }

  if (isbns.size === 0) {
    console.info(
      "Egmont-Shop liefert keine ISBN für die Hauptreihe; es wird keine ISBN " +
        "gesetzt.",
    );
  }

  return isbns;
}
