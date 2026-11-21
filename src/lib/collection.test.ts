import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDateTime,
  getCatalogEntry,
  getOfficialCoverUrl,
  getRowsForNumber,
  getStats,
  isNumberQuery,
  matchesQuery,
  parseCatalog,
  parseCollection,
  parseExactNumber,
} from "./collection";
import type { Catalog, Collection } from "./collection";

const collectionFixture = {
  meta: {
    sheetId: "sheet-id",
    sheetUrl: "https://example.test/sheet",
    syncedAt: "2026-11-21T12:00:00.000Z",
  },
  ltb: [
    { number: 219, containedIn: "MM 4" },
    { number: 219, containedIn: null },
    { number: 13, containedIn: null },
    { number: 31, containedIn: "Mammut 159" },
  ],
  specials: [
    { name: "LTB-History", numbers: [1, 2, 3] },
    { name: "Young", numbers: [] },
  ],
  donaldDuck: [{ number: 201, containedIn: null }],
  panzerknacker: [
    { number: 2, containedIn: null },
    { number: 3, containedIn: "Sammelband" },
  ],
};

const catalogFixture = {
  meta: {
    sources: ["https://example.test/covergalerie"],
    syncedAt: "2026-11-21T12:00:00.000Z",
  },
  entries: [
    {
      number: 13,
      title: "Micky in Gefahr!",
      coverUrl: "https://example.test/cover-13.jpg",
      coverUrlOfficial: "https://example.test/official-13.jpg",
    },
    {
      number: 219,
      title: null,
      coverUrl: null,
      coverUrlOfficial: "https://example.test/official-219.jpg",
    },
  ],
};

const collection: Collection = parseCollection(collectionFixture);
const catalog: Catalog = parseCatalog(catalogFixture);

describe("parseCollection", () => {
  it("behält doppelte Nummern und freie Notizen unverändert", () => {
    expect(collection.ltb).toHaveLength(4);
    expect(collection.ltb[0]).toEqual({ number: 219, containedIn: "MM 4" });
    expect(collection.ltb[1]).toEqual({ number: 219, containedIn: null });
    expect(collection.ltb[3]).toEqual({ number: 31, containedIn: "Mammut 159" });
  });

  it("lehnt ungültige Zeilen mit einer klaren Meldung ab", () => {
    expect(() =>
      parseCollection({
        ...collectionFixture,
        ltb: [{ number: "13", containedIn: null }],
      }),
    ).toThrow(/ltb\[0\]\.number/);
    expect(() => parseCollection({ ...collectionFixture, ltb: "kaputt" })).toThrow(
      /keine Liste/,
    );
  });

  it("prüft die Metadaten", () => {
    expect(() =>
      parseCollection({ ...collectionFixture, meta: { sheetId: 1 } }),
    ).toThrow(/meta\.sheetId/);
  });
});

describe("parseCatalog", () => {
  it("liest Einträge mit optionalen Feldern", () => {
    expect(catalog.entries[1]).toEqual({
      number: 219,
      title: null,
      coverUrl: null,
      coverUrlOfficial: "https://example.test/official-219.jpg",
    });
  });

  it("lehnt fehlende Felder ab", () => {
    expect(() =>
      parseCatalog({
        meta: { sources: [], syncedAt: "2026-11-21T12:00:00.000Z" },
        entries: [{ number: 1, coverUrl: null, coverUrlOfficial: null }],
      }),
    ).toThrow(/title/);
  });
});

describe("getCatalogEntry", () => {
  it("findet Einträge und liefert null für unbekannte Nummern", () => {
    expect(getCatalogEntry(catalog, 13)?.title).toBe("Micky in Gefahr!");
    expect(getCatalogEntry(catalog, 999)).toBeNull();
  });
});

describe("getRowsForNumber", () => {
  it("liefert alle Zeilen einer doppelt erfassten Nummer", () => {
    expect(getRowsForNumber(collection.ltb, 219)).toHaveLength(2);
    expect(getRowsForNumber(collection.ltb, 13)).toHaveLength(1);
    expect(getRowsForNumber(collection.ltb, 7)).toHaveLength(0);
  });
});

describe("getStats", () => {
  it("zählt Nummern eindeutig, Zeilen aber vollständig", () => {
    expect(getStats(collection)).toEqual({
      ltbRows: 4,
      ltbNumbers: 3,
      maxLtbNumber: 219,
      specialsSeries: 2,
      specialsNumbers: 3,
      donaldDuckNumbers: 1,
      panzerknackerNumbers: 2,
    });
  });
});

describe("matchesQuery", () => {
  it("sucht nach Nummer als Präfix", () => {
    expect(matchesQuery(219, "Micky", "21")).toBe(true);
    expect(matchesQuery(219, "Micky", "#219")).toBe(true);
    expect(matchesQuery(13, "Micky", "21")).toBe(false);
  });

  it("sucht nach Titel ohne Beachtung der Großschreibung", () => {
    expect(matchesQuery(13, "Micky in Gefahr!", "gefahr")).toBe(true);
    expect(matchesQuery(13, "Micky in Gefahr!", "donald")).toBe(false);
    expect(matchesQuery(13, null, "micky")).toBe(false);
  });

  it("liefert bei leerer Suche immer true", () => {
    expect(matchesQuery(13, null, "   ")).toBe(true);
  });
});

describe("parseExactNumber", () => {
  it("akzeptiert reine Nummern mit optionalem #", () => {
    expect(parseExactNumber("219")).toBe(219);
    expect(parseExactNumber(" #31 ")).toBe(31);
    expect(parseExactNumber("007")).toBe(7);
  });

  it("lehnt gemischte Eingaben und 0 ab", () => {
    expect(parseExactNumber("219a")).toBeNull();
    expect(parseExactNumber("0")).toBeNull();
    expect(parseExactNumber("Micky")).toBeNull();
  });
});

describe("isNumberQuery", () => {
  it("erkennt Nummern-Eingaben", () => {
    expect(isNumberQuery("219")).toBe(true);
    expect(isNumberQuery("#219")).toBe(true);
    expect(isNumberQuery("Mammut 159")).toBe(false);
  });
});

describe("Formatierung", () => {
  it("formatiert Anzahlen und offizielle Cover-URLs", () => {
    expect(formatCount(1234, "de")).toBe("1.234");
    expect(formatCount(1234, "en")).toBe("1,234");
    expect(getOfficialCoverUrl(603)).toBe(
      "https://www.lustiges-taschenbuch.de/sites/default/files/cover/LTB-603.jpg",
    );
  });

  it("gibt bei ungültigen Datumswerten den Rohwert zurück", () => {
    expect(formatDateTime("kein Datum", "de")).toBe("kein Datum");
    expect(formatDateTime("2026-11-21T12:00:00.000Z", "en")).toContain("2026");
  });
});
