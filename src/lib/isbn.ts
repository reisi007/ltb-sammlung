/**
 * ISBN-/EAN-Auflösung für den Scanner.
 *
 * Der gedruckte Barcode eines Bandes ist eine ISBN-13 (EAN mit 978/979), nicht
 * die LTB-Nummer. Diese Helfer normalisieren die ISBN und bilden sie über den
 * Katalog bzw. die gelernten Zuordnungen auf eine LTB-Nummer ab. Unbekannte
 * ISBNs ergeben bewusst keine Nummer — raten wäre schlimmer als kein Treffer.
 */
import { extractNumberFromScan } from "./add";
import type { Catalog } from "./collection";

export type ScanResult =
  | { kind: "number"; number: number; isbn: null }
  | { kind: "isbn"; number: number; isbn: string }
  | { kind: "unknown-isbn"; number: null; isbn: string }
  | { kind: "invalid"; number: null; isbn: null };

function isbn13FromIsbn10(isbn10: string): string {
  const core = `978${isbn10.slice(0, 9)}`;
  let sum = 0;

  for (let index = 0; index < 12; index += 1) {
    sum += Number(core[index]) * (index % 2 === 0 ? 1 : 3);
  }

  return `${core}${(10 - (sum % 10)) % 10}`;
}

/**
 * Normalisiert ISBN-10 oder ISBN-13 (auch mit Bindestrichen) auf eine gültige
 * ISBN-13. Alles andere — inklusive fremder EANs — ergibt `null`.
 */
export function normalizeIsbn(value: string): string | null {
  const normalized = value.toUpperCase().replace(/[^0-9X]/g, "");

  if (/^\d{9}[\dX]$/.test(normalized)) {
    let sum = 0;

    for (let index = 0; index < 10; index += 1) {
      const character = normalized[index];
      const digit = character === "X" ? 10 : Number(character);
      sum += digit * (10 - index);
    }

    return sum % 11 === 0 ? isbn13FromIsbn10(normalized) : null;
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

export function resolveScan(
  payload: string,
  catalog: Catalog,
  isbnMap: Readonly<Record<string, number>>,
): ScanResult {
  const number = extractNumberFromScan(payload);

  if (number !== null) {
    return { kind: "number", number, isbn: null };
  }

  const isbn = normalizeIsbn(payload);

  if (isbn === null) {
    return { kind: "invalid", number: null, isbn: null };
  }

  // Zuerst die gelernte Zuordnung, dann der Katalog — dieselbe Reihenfolge
  // wie die API in `api/src/Api.php`.
  const learned = isbnMap[isbn];

  if (typeof learned === "number") {
    return { kind: "isbn", number: learned, isbn };
  }

  for (const entry of catalog.entries) {
    if (entry.isbn !== null && normalizeIsbn(entry.isbn) === isbn) {
      return { kind: "isbn", number: entry.number, isbn };
    }
  }

  return { kind: "unknown-isbn", number: null, isbn };
}
