/**
 * Reine Helfer für das Erfassen von Bänden: Eingabe parsen, Scan-Payload
 * auswerten und Duplikate zählen. Bewusst ohne UI, damit es testbar bleibt.
 */
import type { CollectionRow } from "./collection";

/** Obergrenze pro Anlege-Vorgang; bewusst hoch, damit Bulk-Eingaben nicht brechen. */
export const MAX_ADD_ITEMS = 200;
/** Die Suche bleibt bei drei Nummern, damit die Trefferleiste lesbar bleibt. */
export const MAX_SEARCH_NUMBERS = 3;
export const MAX_VOLUME_NUMBER = 99999;

export type AddValidationError =
  | "empty"
  | "too-many"
  | "invalid-number"
  | "number-out-of-range";

export interface AddValidation {
  ok: boolean;
  numbers: number[];
  error: AddValidationError | null;
}

/**
 * Liest eine Nummer aus einem Scan-Payload. Unterstützt:
 * - reine Ziffern ("219")
 * - Präfixe wie "LTB 219", "LTB-Nr. 219", "#219"
 * - URLs mit der Nummer am Ende ("https://…/band-219")
 *
 * Alles andere (z. B. eine ISBN/EAN-13) ergibt `null`: Die Nummer wäre sonst
 * geraten, und ein falsch erfasster Band ist schlimmer als kein Treffer.
 */
export function extractNumberFromScan(payload: string): number | null {
  const trimmed = payload.trim();

  if (trimmed === "") {
    return null;
  }

  const direct = /^(?:ltb[\s\-–]*(?:nr\.?|nummer)?[\s\-–]*)?#?(\d{1,5})$/i.exec(
    trimmed,
  );

  if (direct !== null) {
    return toVolumeNumber(direct[1]);
  }

  const url = /(?:^|\/)(?:band|ltb)[-_ ]?(\d{1,5})\/?$/i.exec(trimmed);

  if (url !== null) {
    return toVolumeNumber(url[1]);
  }

  return null;
}

function toVolumeNumber(raw: string): number | null {
  const number = Number.parseInt(raw, 10);

  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_VOLUME_NUMBER) {
    return null;
  }

  return number;
}

/**
 * Parst eine Texteingabe. Kommas, Semikolons, Leerzeichen und Zeilenumbrüche
 * trennen mehrere Nummern; "LTB 219" und "#219" sind erlaubt.
 */
export function parseVolumeInput(text: string): number[] {
  const parts = text
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "");

  const numbers: number[] = [];

  for (const part of parts) {
    const number = extractNumberFromScan(part);

    if (number !== null) {
      numbers.push(number);
    }
  }

  return numbers;
}

export interface SearchNumbers {
  /** Gueltige Nummern, hoechstens {@link MAX_SEARCH_NUMBERS}. */
  numbers: number[];
  /** Ziffernfolgen ausserhalb von 1..{@link MAX_VOLUME_NUMBER}. */
  invalid: string[];
  /** true, wenn mehr als {@link MAX_SEARCH_NUMBERS} Nummern eingegeben wurden. */
  tooMany: boolean;
}

/**
 * Erkennt eine Suche nach mehreren Nummern ("12, 13 14"). Nur wenn alle
 * Bestandteile Ziffern sind; sonst bleibt es eine normale Textsuche.
 * Eine einzelne Nummer ist Sache der exakten Trefferleiste.
 */
export function parseSearchNumbers(query: string): SearchNumbers | null {
  const parts = query
    .trim()
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "");

  if (parts.length < 2) {
    return null;
  }

  const numbers: number[] = [];
  const invalid: string[] = [];

  for (const part of parts) {
    const number = extractNumberFromScan(part);

    if (number !== null) {
      numbers.push(number);
    } else if (/^\d+$/.test(part)) {
      invalid.push(part);
    } else {
      return null;
    }
  }

  const tooMany = numbers.length > MAX_SEARCH_NUMBERS;

  return {
    numbers: tooMany ? numbers.slice(0, MAX_SEARCH_NUMBERS) : numbers,
    invalid,
    tooMany,
  };
}

export function validateAddNumbers(
  numbers: readonly number[],
  limit: number = MAX_ADD_ITEMS,
): AddValidation {
  if (numbers.length === 0) {
    return { ok: false, numbers: [], error: "empty" };
  }

  if (numbers.length > limit) {
    return { ok: false, numbers: [...numbers], error: "too-many" };
  }

  for (const number of numbers) {
    if (!Number.isFinite(number) || !Number.isInteger(number)) {
      return { ok: false, numbers: [...numbers], error: "invalid-number" };
    }

    if (number < 1 || number > MAX_VOLUME_NUMBER) {
      return { ok: false, numbers: [...numbers], error: "number-out-of-range" };
    }
  }

  return { ok: true, numbers: [...numbers], error: null };
}

/** Anzahl der Exemplare je Nummer; nur Nummern mit mehr als einer Zeile. */
export function getDuplicateNumbers(
  rows: readonly CollectionRow[],
): Map<number, number> {
  const counts = new Map<number, number>();

  for (const row of rows) {
    counts.set(row.number, (counts.get(row.number) ?? 0) + 1);
  }

  for (const [number, count] of counts) {
    if (count < 2) {
      counts.delete(number);
    }
  }

  return counts;
}

/**
 * Teilt eine Dialogzeile an Komma, Semikolon oder Zeilenumbruch. Leerzeichen
 * bleiben Teil eines Tokens, damit "LTB 219" zusammenbleibt.
 */
export function splitNumberInput(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export interface AddItem {
  number: number;
  containedIn: string | null;
}

export interface AddRowInput {
  /** `null`, wenn die Zeile leer oder ungültig ist. */
  number: number | null;
  note: string;
}

/**
 * Baut die API-Einträge aus den Dialogzeilen. Leere Zeilen werden
 * übersprungen; die Notiz bleibt an ihrer Zeile — auch wenn dazwischen eine
 * Zeile leer ist.
 */
export function buildAddItems(rows: readonly AddRowInput[]): AddItem[] {
  return rows
    .filter(
      (row): row is AddRowInput & { number: number } => row.number !== null,
    )
    .map((row) => {
      const note = row.note.trim();

      return { number: row.number, containedIn: note === "" ? null : note };
    });
}

export function toAddItems(
  numbers: readonly number[],
  notes: readonly string[] = [],
): AddItem[] {
  return numbers.map((number, index) => {
    const note = notes[index]?.trim() ?? "";

    return { number, containedIn: note === "" ? null : note };
  });
}
