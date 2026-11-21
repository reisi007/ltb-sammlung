/**
 * Reine Datenlogik für die Sammlung und den Cover-/Titelkatalog.
 *
 * Wichtig: `containedIn` ist eine freie Notiz pro Zeile, kein Fremdschlüssel.
 * Zeilen werden weder dedupliziert noch verknüpft; die Nummer 219 darf also
 * zweimal vorkommen.
 */

export interface CollectionMeta {
  sheetId: string;
  sheetUrl: string;
  syncedAt: string;
}

export interface CollectionRow {
  number: number;
  containedIn: string | null;
}

export interface SpecialSeries {
  name: string;
  numbers: number[];
}

export interface Collection {
  meta: CollectionMeta;
  ltb: CollectionRow[];
  /** Gelernte ISBN-13 (normalisiert) => LTB-Nummer, aus dem Scanner. */
  isbnMap: Record<string, number>;
  specials: SpecialSeries[];
  donaldDuck: CollectionRow[];
  panzerknacker: CollectionRow[];
}

export interface CatalogMeta {
  sources: string[];
  syncedAt: string;
}

export interface CatalogEntry {
  number: number;
  title: string | null;
  coverUrl: string | null;
  coverUrlOfficial: string | null;
  /** ISBN-13 des Bandes, wenn die Quelle sie liefert. */
  isbn: string | null;
}

export interface SeriesCatalogEntry {
  number: number;
  title: string | null;
  coverUrl: string | null;
}

export interface Catalog {
  meta: CatalogMeta;
  entries: CatalogEntry[];
  series: Record<string, SeriesCatalogEntry[]>;
}

export interface CollectionStats {
  ltbRows: number;
  ltbNumbers: number;
  maxLtbNumber: number;
  specialsSeries: number;
  specialsNumbers: number;
  donaldDuckNumbers: number;
  panzerknackerNumbers: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Datenfeld „${field}“ ist kein Objekt.`);
  }

  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Datenfeld „${field}“ ist kein Text.`);
  }

  return value;
}

function parseCollectionMeta(value: unknown): CollectionMeta {
  const meta = requireRecord(value, "meta");

  return {
    sheetId: requireString(meta.sheetId, "meta.sheetId"),
    sheetUrl: requireString(meta.sheetUrl, "meta.sheetUrl"),
    syncedAt: requireString(meta.syncedAt, "meta.syncedAt"),
  };
}

function parseRows(value: unknown, field: string): CollectionRow[] {
  if (!Array.isArray(value)) {
    throw new Error(`Datenfeld „${field}“ ist keine Liste.`);
  }

  return value.map((entry, index) => {
    const row = requireRecord(entry, `${field}[${index}]`);

    if (
      typeof row.number !== "number" ||
      !Number.isSafeInteger(row.number) ||
      row.number < 0
    ) {
      throw new Error(`Datenfeld „${field}[${index}].number“ ist ungültig.`);
    }

    if (row.containedIn !== null && typeof row.containedIn !== "string") {
      throw new Error(
        `Datenfeld „${field}[${index}].containedIn“ ist weder Text noch null.`,
      );
    }

    return { number: row.number, containedIn: row.containedIn };
  });
}

function parseSpecials(value: unknown): SpecialSeries[] {
  if (!Array.isArray(value)) {
    throw new Error("Datenfeld „specials“ ist keine Liste.");
  }

  return value.map((entry, index) => {
    const series = requireRecord(entry, `specials[${index}]`);
    const name = requireString(series.name, `specials[${index}].name`);

    if (name === "") {
      throw new Error(`Datenfeld „specials[${index}].name“ ist leer.`);
    }

    if (!Array.isArray(series.numbers)) {
      throw new Error(`Datenfeld „specials[${index}].numbers“ ist keine Liste.`);
    }

    const numbers: number[] = [];

    for (const number of series.numbers) {
      if (typeof number !== "number" || !Number.isSafeInteger(number)) {
        throw new Error(
          `Datenfeld „specials[${index}].numbers“ enthält keine gültige Nummer.`,
        );
      }

      numbers.push(number);
    }

    return { name, numbers };
  });
}

function parseIsbnMap(value: unknown): Record<string, number> {
  if (value === undefined || value === null) {
    return {};
  }

  // PHP kodiert eine leere Map als [] — das ist leer, keine Liste.
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return {};
    }

    throw new Error("Datenfeld „isbnMap“ ist eine Liste statt einer Zuordnung.");
  }

  const raw = requireRecord(value, "isbnMap");
  const mapping: Record<string, number> = {};

  for (const [isbn, number] of Object.entries(raw)) {
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) {
      throw new Error(`Datenfeld „isbnMap.${isbn}“ ist keine gültige Nummer.`);
    }

    mapping[isbn] = number;
  }

  return mapping;
}

export function parseCollection(value: unknown): Collection {
  const collection = requireRecord(value, "collection");

  return {
    meta: parseCollectionMeta(collection.meta),
    ltb: parseRows(collection.ltb, "ltb"),
    isbnMap: parseIsbnMap(collection.isbnMap),
    specials: parseSpecials(collection.specials),
    donaldDuck: parseRows(collection.donaldDuck, "donaldDuck"),
    panzerknacker: parseRows(collection.panzerknacker, "panzerknacker"),
  };
}

export function parseCatalog(value: unknown): Catalog {
  const catalog = requireRecord(value, "catalog");
  const meta = requireRecord(catalog.meta, "catalog.meta");

  if (!Array.isArray(meta.sources) || !meta.sources.every((source) => typeof source === "string")) {
    throw new Error("Datenfeld „catalog.meta.sources“ ist keine Textliste.");
  }

  if (!Array.isArray(catalog.entries)) {
    throw new Error("Datenfeld „catalog.entries“ ist keine Liste.");
  }

  const entries = catalog.entries.map((entry, index) => {
    const item = requireRecord(entry, `catalog.entries[${index}]`);

    if (typeof item.number !== "number" || !Number.isSafeInteger(item.number)) {
      throw new Error(`Datenfeld „catalog.entries[${index}].number“ ist ungültig.`);
    }

    const readNullableString = (field: string): string | null => {
      const rawValue = item[field];

      if (rawValue === null) {
        return null;
      }

      return requireString(rawValue, `catalog.entries[${index}].${field}`);
    };

    return {
      number: item.number,
      title: readNullableString("title"),
      coverUrl: readNullableString("coverUrl"),
      coverUrlOfficial: readNullableString("coverUrlOfficial"),
      isbn:
        item.isbn === undefined || item.isbn === null
          ? null
          : requireString(item.isbn, `catalog.entries[${index}].isbn`),
    };
  });

  const series: Record<string, SeriesCatalogEntry[]> = {};

  if (catalog.series !== undefined) {
    const rawSeries = requireRecord(catalog.series, "catalog.series");

    for (const [name, value] of Object.entries(rawSeries)) {
      if (!Array.isArray(value)) {
        throw new Error(`Datenfeld „catalog.series.${name}“ ist keine Liste.`);
      }

      series[name] = value.map((entry, index) => {
        const item = requireRecord(
          entry,
          `catalog.series.${name}[${index}]`,
        );

        if (typeof item.number !== "number" || !Number.isSafeInteger(item.number)) {
          throw new Error(
            `Datenfeld „catalog.series.${name}[${index}].number“ ist ungültig.`,
          );
        }

        const readNullableString = (field: string): string | null => {
          const rawValue = item[field];

          if (rawValue === null) {
            return null;
          }

          return requireString(
            rawValue,
            `catalog.series.${name}[${index}].${field}`,
          );
        };

        return {
          number: item.number,
          title: readNullableString("title"),
          coverUrl: readNullableString("coverUrl"),
        };
      });
    }
  }

  return {
    meta: {
      sources: [...meta.sources],
      syncedAt: requireString(meta.syncedAt, "catalog.meta.syncedAt"),
    },
    entries,
    series,
  };
}

export async function loadCatalogData(): Promise<Catalog> {
  const module = await import("../data/catalog.json");

  return parseCatalog(module.default);
}

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
