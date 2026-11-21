/**
 * Reine Helfer für das Erfassen von Bänden: Eingabe parsen, Scan-Payload
 * auswerten und Duplikate zählen. Bewusst ohne UI, damit es testbar bleibt.
 */
import type { CollectionRow } from "./collection";

export const MAX_ADD_ITEMS = 3;
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

export interface AddItem {
  number: number;
  containedIn: string | null;
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
