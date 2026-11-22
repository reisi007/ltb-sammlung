import type {
  Catalog,
  CatalogEntry,
  Collection,
  CollectionRow,
  CollectionStats,
  SeriesCatalogEntry,
} from "./types";

const catalogIndexes = new WeakMap<Catalog, Map<number, CatalogEntry>>();

export function getCatalogEntry(
  catalog: Catalog,
  number: number,
): CatalogEntry | null {
  let index = catalogIndexes.get(catalog);

  if (index === undefined) {
    index = new Map(catalog.entries.map((entry) => [entry.number, entry]));
    catalogIndexes.set(catalog, index);
  }

  return index.get(number) ?? null;
}

const seriesIndexes = new WeakMap<
  Catalog,
  Map<string, Map<number, SeriesCatalogEntry>>
>();

export function getSeriesEntry(
  catalog: Catalog,
  seriesName: string,
  number: number,
): SeriesCatalogEntry | null {
  let index = seriesIndexes.get(catalog);

  if (index === undefined) {
    index = new Map();

    for (const [name, entries] of Object.entries(catalog.series)) {
      index.set(name, new Map(entries.map((entry) => [entry.number, entry])));
    }

    seriesIndexes.set(catalog, index);
  }

  return index.get(seriesName)?.get(number) ?? null;
}

export function getRowsForNumber(
  rows: CollectionRow[],
  number: number,
): CollectionRow[] {
  return rows.filter((row) => row.number === number);
}

export interface LtbRowGroup {
  number: number;
  rows: CollectionRow[];
}

/**
 * Fasst doppelte LTB-Zeilen nur für die Anzeige zusammen. Die Datenhaltung
 * bleibt unverändert: jede Zeile behält Nummer, Notiz und Occurrence; die
 * Kachel zeigt die Anzahl als Badge und alle Notizen der Gruppe.
 */
export function groupLtbRows(rows: CollectionRow[]): LtbRowGroup[] {
  const groups = new Map<number, CollectionRow[]>();

  for (const row of rows) {
    const group = groups.get(row.number);

    if (group === undefined) {
      groups.set(row.number, [row]);
    } else {
      group.push(row);
    }
  }

  return [...groups.entries()].map(([number, groupedRows]) => ({
    number,
    rows: groupedRows,
  }));
}

export function getStats(collection: Collection): CollectionStats {
  const ltbNumbers = new Set(collection.ltb.map((row) => row.number));
  const donaldDuckNumbers = new Set(
    collection.donaldDuck.map((row) => row.number),
  );
  const panzerknackerNumbers = new Set(
    collection.panzerknacker.map((row) => row.number),
  );

  return {
    ltbRows: collection.ltb.length,
    ltbNumbers: ltbNumbers.size,
    maxLtbNumber:
      ltbNumbers.size === 0 ? 0 : Math.max(...ltbNumbers),
    specialsSeries: collection.specials.length,
    specialsNumbers: collection.specials.reduce(
      (sum, series) => sum + series.numbers.length,
      0,
    ),
    donaldDuckNumbers: donaldDuckNumbers.size,
    panzerknackerNumbers: panzerknackerNumbers.size,
  };
}

export function parseExactNumber(query: string): number | null {
  const normalized = query.trim().replace(/^#/, "");

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const number = Number.parseInt(normalized, 10);

  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function isNumberQuery(query: string): boolean {
  return /^\d+$/.test(query.trim().replace(/^#/, ""));
}

export function matchesQuery(
  number: number,
  title: string | null,
  query: string,
): boolean {
  const normalized = query.trim().replace(/^#/, "").toLowerCase();

  if (normalized === "") {
    return true;
  }

  if (/^\d+$/.test(normalized)) {
    return String(number).startsWith(normalized);
  }

  return title !== null && title.toLowerCase().includes(normalized);
}

export function getOfficialCoverUrl(number: number): string {
  return `https://www.lustiges-taschenbuch.de/sites/default/files/cover/LTB-${number}.jpg`;
}

export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDateTime(isoDate: string, locale: string): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
