import {
  extractNumberFromScan,
  splitNumberInput,
} from "../../lib/add";

export interface AddRowState {
  id: number;
  value: string;
  note: string;
}

export interface ParsedRow {
  row: AddRowState;
  numbers: number[];
  invalid: boolean;
}

let nextRowId = 1;

export function createRow(value = "", note = ""): AddRowState {
  return { id: nextRowId++, value, note };
}

/**
 * Teilt Zeilen mit mehreren Nummern in je eine Zeile auf. Die Notiz bleibt an
 * der ersten Nummer; die weiteren starten leer. So bleibt pro Band eine eigene
 * Notiz möglich, auch wenn die Nummern kommagetrennt eingegeben wurden.
 */
export function expandRows(rows: AddRowState[]): AddRowState[] {
  const expanded: AddRowState[] = [];
  let changed = false;

  for (const row of rows) {
    const tokens = splitNumberInput(row.value);

    if (tokens.length < 2) {
      expanded.push(row);
      continue;
    }

    changed = true;

    tokens.forEach((token, index) => {
      expanded.push(createRow(token, index === 0 ? row.note : ""));
    });
  }

  return changed ? expanded : rows;
}

export function parseRows(rows: AddRowState[]): ParsedRow[] {
  return rows.map((row) => {
    const tokens = splitNumberInput(row.value);
    const rowNumbers = tokens.map((token) => extractNumberFromScan(token));

    return {
      row,
      numbers: rowNumbers.filter((value): value is number => value !== null),
      invalid: rowNumbers.some((value) => value === null),
    };
  });
}
