/**
 * Prueft den Build auf versehentlich gebuendelte Sammlungsdaten.
 *
 * Die App-Huelle ist ohne Login erreichbar. Private Daten duerfen deshalb nur
 * ueber /api/* mit Session ausgeliefert werden, niemals als Asset. Der Check
 * ist absichtlich formatunabhaengig: der minifizierte Snapshot hatte
 * unquotierte Keys (`sheetId:\`…\``, `containedIn:null`), ein Grep nach
 * `"containedIn":"` haette ihn nicht gefunden.
 *
 * Aufruf: node scripts/assert-no-collection-data.mjs [dist]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "dist";
const patterns = [
  // Sheet-ID/URL des Seeds, unabhaengig von Quotes/Backticks.
  /sheetId\s*[:=]\s*["'`][A-Za-z0-9_-]{20,}/,
  /docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/,
  // Nur echte Notiz-Strings; `containedIn:t` (Minifier-Variable) matcht nicht.
  /containedIn\s*:\s*["'`][^"'`]/,
];

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const info = statSync(path);

    if (info.isDirectory()) {
      yield* walk(path);
    } else if (/\.(js|mjs|css|html|json|map)$/.test(entry)) {
      yield path;
    }
  }
}

const hits = [];

try {
  for (const file of walk(root)) {
    const content = readFileSync(file, "utf8");

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        hits.push(`${file} (${pattern})`);
        break;
      }
    }
  }
} catch (error) {
  process.stderr.write(`FEHLER: ${root} nicht lesbar: ${String(error)}\n`);
  process.exit(2);
}

if (hits.length > 0) {
  process.stderr.write(
    "FEHLER: Sammlungsdaten im Build gefunden. Private Daten duerfen nur\n" +
      "        ueber /api/* mit Login ausgeliefert werden.\n",
  );

  for (const hit of hits) {
    process.stderr.write(`  - ${hit}\n`);
  }

  process.exit(1);
}

process.stdout.write(`OK: ${root} enthaelt keine Sammlungsdaten.\n`);
