import type {
  Catalog,
  Collection,
  CollectionMeta,
  CollectionRow,
  SeriesCatalogEntry,
  SpecialSeries,
} from "./types";

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
