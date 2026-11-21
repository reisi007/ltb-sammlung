import { describe, expect, it } from "vitest";
import type { Catalog } from "./collection";
import { normalizeIsbn, resolveScan } from "./isbn";

const catalog: Catalog = {
  meta: { sources: [], syncedAt: "2026-01-01T00:00:00.000Z" },
  entries: [
    {
      number: 219,
      title: "Der Zauber-Zylinder",
      coverUrl: null,
      coverUrlOfficial: null,
      isbn: "978-3-7704-0219-9",
    },
    {
      number: 13,
      title: "Micky in Gefahr!",
      coverUrl: null,
      coverUrlOfficial: null,
      isbn: null,
    },
  ],
  series: {},
};

describe("normalizeIsbn", () => {
  it("normalisiert ISBN-13 mit Bindestrichen", () => {
    expect(normalizeIsbn("978-3-7704-0219-9")).toBe("9783770402199");
    expect(normalizeIsbn("9783770402199")).toBe("9783770402199");
  });

  it("rechnet ISBN-10 in ISBN-13 um", () => {
    expect(normalizeIsbn("3-7704-0219-7")).toBe("9783770402199");
  });

  it("lehnt falsche Pruefziffern und fremde EANs ab", () => {
    expect(normalizeIsbn("9783770402190")).toBeNull();
    expect(normalizeIsbn("4006381333931")).toBeNull();
    expect(normalizeIsbn("keine isbn")).toBeNull();
  });
});

describe("resolveScan", () => {
  it("erkennt eine reine LTB-Nummer", () => {
    expect(resolveScan("LTB 219", catalog, {})).toEqual({
      kind: "number",
      number: 219,
      isbn: null,
    });
  });

  it("bildet eine Katalog-ISBN auf die Nummer ab", () => {
    expect(resolveScan("978-3-7704-0219-9", catalog, {})).toEqual({
      kind: "isbn",
      number: 219,
      isbn: "9783770402199",
    });
  });

  it("nutzt eine gelernte Zuordnung", () => {
    expect(resolveScan("9783770402205", catalog, { "9783770402205": 13 })).toEqual({
      kind: "isbn",
      number: 13,
      isbn: "9783770402205",
    });
  });

  it("meldet eine unbekannte ISBN statt zu raten", () => {
    expect(resolveScan("9783770402205", catalog, {})).toEqual({
      kind: "unknown-isbn",
      number: null,
      isbn: "9783770402205",
    });
  });

  it("lehnt fremde Payloads ab", () => {
    expect(resolveScan("https://example.test/foo", catalog, {})).toEqual({
      kind: "invalid",
      number: null,
      isbn: null,
    });
  });
});
