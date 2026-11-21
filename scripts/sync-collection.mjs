#!/usr/bin/env node
/**
 * Synchronisiert die vier Tabs des Google Sheets in src/data/collection.json.
 *
 * Die Datei ist ein reiner Snapshot. Sie enthält bewusst keine relationalen
 * Verknüpfungen: "Enthalten in" bleibt eine freie Notiz pro Zeile, doppelte
 * Nummern bleiben erhalten.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./csv.ts";

const DEFAULT_SHEET_ID = "1-92-cWvC9F4LtSfQJf80mVzIGPmljo_VQ6rZXI6ihNc";
const SHEET_ID = process.env.SHEET_ID ?? DEFAULT_SHEET_ID;

const GIDS = {
  ltb: process.env.LTB_GID ?? "0",
  specials: process.env.SPECIALS_GID ?? "643921616",
  donaldDuck: process.env.DONALD_DUCK_GID ?? "1340377721",
  panzerknacker: process.env.PANZERKNACKER_GID ?? "1496243958",
};

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const OUTPUT_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/collection.json",
);
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT =
  "ltb-sammlung/0.1 (+https://github.com/reisi007/ltb-sammlung)";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

async function fetchCsv(gid, label) {
  const url = csvUrl(gid);
  let response;

  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT },
    });
  } catch (error) {
    throw new Error(`${label}: Abruf fehlgeschlagen (${url}): ${errorMessage(error)}`);
  }

  if (!response.ok) {
    throw new Error(
      `${label}: HTTP ${response.status} ${response.statusText} (${url}). ` +
        "Ist das Sheet weiterhin für „Jeder mit Link“ freigegeben?",
    );
  }

  const text = await response.text();

  if (text.trim() === "") {
    throw new Error(`${label}: Die CSV-Antwort ist leer (${url}).`);
  }

  if (/^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
    throw new Error(
      `${label}: Statt CSV wurde HTML geliefert (${url}). ` +
        "Das passiert meist bei fehlender Freigabe oder einer Anmeldung.",
    );
  }

  return text;
}

function nonEmptyRows(text, label) {
  const rows = parseCsv(text).filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );

  if (rows.length === 0) {
    throw new Error(`${label}: Die CSV-Datei enthält keine Daten.`);
  }

  return rows;
}

function parseNumberCell(rawValue, label, rowNumber) {
  const value = String(rawValue ?? "").trim();

  if (!/^\d+$/.test(value)) {
    throw new Error(
      `${label}: Zeile ${rowNumber} enthält keine gültige Nummer: „${value}“.`,
    );
  }

  const number = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(number)) {
    throw new Error(`${label}: Zeile ${rowNumber} enthält eine zu große Nummer.`);
  }

  return number;
}

function parseCollectionTab(text, label) {
  const rows = nonEmptyRows(text, label);
  const header = rows[0].map((cell) => cell.trim().toLowerCase());

  if (header[0] !== "nummer" || header[1] !== "enthalten in") {
    throw new Error(
      `${label}: Unerwartete Kopfzeile (${rows[0].join(" | ")}). ` +
        "Erwartet werden die Spalten „Nummer“ und „Enthalten in“.",
    );
  }

  const entries = [];

  rows.slice(1).forEach((row, index) => {
    const number = parseNumberCell(row[0], label, index + 2);
    const note = String(row[1] ?? "").trim();

    // Kein Join, keine Deduplizierung: jede Zeile bleibt eine eigene Zeile.
    entries.push({ number, containedIn: note === "" ? null : note });
  });

  return entries;
}

function parseSpecialsTab(text, label) {
  const rows = nonEmptyRows(text, label);
  const header = rows[0].map((cell) => cell.trim());
  const columns = header
    .map((name, index) => ({ name, index, numbers: [] }))
    .filter((column) => column.name !== "");

  if (columns.length === 0) {
    throw new Error(`${label}: Die Kopfzeile enthält keine Seriennamen.`);
  }

  rows.slice(1).forEach((row, rowIndex) => {
    columns.forEach((column) => {
      const rawValue = String(row[column.index] ?? "").trim();

      if (rawValue === "") {
        return;
      }

      column.numbers.push(parseNumberCell(rawValue, label, rowIndex + 2));
    });
  });

  return columns.map((column) => ({
    name: column.name,
    numbers: [...new Set(column.numbers)].sort((a, b) => a - b),
  }));
}

async function main() {
  const [ltbText, specialsText, donaldDuckText, panzerknackerText] =
    await Promise.all([
      fetchCsv(GIDS.ltb, "Tab „LTB“"),
      fetchCsv(GIDS.specials, "Tab „Sonderserien“"),
      fetchCsv(GIDS.donaldDuck, "Tab „Donald Duck“"),
      fetchCsv(GIDS.panzerknacker, "Tab „Panzerknacker & Co“"),
    ]);

  const collection = {
    meta: {
      sheetId: SHEET_ID,
      sheetUrl: SHEET_URL,
      syncedAt: new Date().toISOString(),
    },
    ltb: parseCollectionTab(ltbText, "Tab „LTB“"),
    specials: parseSpecialsTab(specialsText, "Tab „Sonderserien“"),
    donaldDuck: parseCollectionTab(donaldDuckText, "Tab „Donald Duck“"),
    panzerknacker: parseCollectionTab(
      panzerknackerText,
      "Tab „Panzerknacker & Co“",
    ),
  };

  if (collection.ltb.length === 0) {
    throw new Error(
      "Tab „LTB“ lieferte keine Zeilen. Es wurde nichts geschrieben.",
    );
  }

  if (
    collection.specials.length === 0 ||
    collection.specials.every((series) => series.numbers.length === 0)
  ) {
    throw new Error(
      "Tab „Sonderserien“ lieferte keine Nummern. Es wurde nichts geschrieben.",
    );
  }

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(collection, null, 2)}\n`, "utf8");

  const specialsNumbers = collection.specials.reduce(
    (sum, series) => sum + series.numbers.length,
    0,
  );

  console.info(
    `collection.json geschrieben: ${collection.ltb.length} LTB-Zeilen, ` +
      `${collection.specials.length} Sonderserien (${specialsNumbers} Nummern), ` +
      `${collection.donaldDuck.length} Donald-Duck-Zeilen, ` +
      `${collection.panzerknacker.length} Panzerknacker-Zeilen.`,
  );
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
