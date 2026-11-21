import { describe, expect, it } from "vitest";
import {
  MAX_ADD_ITEMS,
  buildAddItems,
  extractNumberFromScan,
  getDuplicateNumbers,
  parseSearchNumbers,
  parseVolumeInput,
  toAddItems,
  validateAddNumbers,
} from "./add";
import type { CollectionRow } from "./collection";

describe("extractNumberFromScan", () => {
  it("liest reine Nummern und übliche Präfixe", () => {
    expect(extractNumberFromScan("219")).toBe(219);
    expect(extractNumberFromScan("  #219 ")).toBe(219);
    expect(extractNumberFromScan("LTB 219")).toBe(219);
    expect(extractNumberFromScan("LTB-Nr. 219")).toBe(219);
    expect(extractNumberFromScan("ltb nummer 42")).toBe(42);
  });

  it("liest die Nummer aus Band-URLs", () => {
    expect(
      extractNumberFromScan("https://www.lustiges-taschenbuch.de/ausgaben/band-219"),
    ).toBe(219);
    expect(extractNumberFromScan("/nebenreihen/spezial/band-133")).toBe(133);
  });

  it("lehnt fremde Payloads ab, statt eine Nummer zu raten", () => {
    expect(extractNumberFromScan("")).toBeNull();
    expect(extractNumberFromScan("978-3-7704-0000-0")).toBeNull();
    expect(extractNumberFromScan("https://example.test/shop")).toBeNull();
    expect(extractNumberFromScan("0")).toBeNull();
    expect(extractNumberFromScan("123456")).toBeNull();
  });
});

describe("parseVolumeInput", () => {
  it("trennt mehrere Nummern an Komma, Semikolon und Leerzeichen", () => {
    expect(parseVolumeInput("12, 13;14")).toEqual([12, 13, 14]);
    expect(parseVolumeInput("LTB 1   LTB 2")).toEqual([1, 2]);
  });

  it("ignoriert ungültige Teile", () => {
    expect(parseVolumeInput("12, abc, 13")).toEqual([12, 13]);
    expect(parseVolumeInput("   ")).toEqual([]);
  });
});

describe("validateAddNumbers", () => {
  it("erlaubt ein bis drei Nummern inklusive Duplikaten", () => {
    expect(validateAddNumbers([219]).ok).toBe(true);
    expect(validateAddNumbers([219, 219]).ok).toBe(true);
    expect(validateAddNumbers([1, 2, 3]).ok).toBe(true);
  });

  it("meldet die konkreten Grenzverletzungen", () => {
    expect(validateAddNumbers([]).error).toBe("empty");
    expect(validateAddNumbers([1, 2, 3, 4]).error).toBe("too-many");
    expect(validateAddNumbers([1.5]).error).toBe("invalid-number");
    expect(validateAddNumbers([0]).error).toBe("number-out-of-range");
  });

  it("hält die Obergrenze aus der Konstante ein", () => {
    const numbers = Array.from({ length: MAX_ADD_ITEMS + 1 }, (_, index) => index + 1);

    expect(validateAddNumbers(numbers, MAX_ADD_ITEMS).error).toBe("too-many");
  });
});

describe("getDuplicateNumbers", () => {
  const rows: CollectionRow[] = [
    { number: 219, containedIn: "MM 4" },
    { number: 219, containedIn: null },
    { number: 13, containedIn: null },
    { number: 31, containedIn: "Mammut 159" },
  ];

  it("liefert nur Nummern mit mindestens zwei Zeilen", () => {
    const duplicates = getDuplicateNumbers(rows);

    expect([...duplicates.entries()]).toEqual([[219, 2]]);
    expect(duplicates.get(13)).toBeUndefined();
  });

  it("verträgt eine leere Sammlung", () => {
    expect(getDuplicateNumbers([]).size).toBe(0);
  });
});

describe("buildAddItems", () => {
  it("lässt die Notiz an ihrer Zeile, auch wenn dazwischen eine Zeile leer ist", () => {
    expect(
      buildAddItems([
        { number: null, note: "" },
        { number: 219, note: "Zweites Exemplar" },
      ]),
    ).toEqual([{ number: 219, containedIn: "Zweites Exemplar" }]);
  });

  it("verwirft Notizen aus leeren Zeilen nicht auf die falsche Nummer", () => {
    expect(
      buildAddItems([
        { number: 12, note: "" },
        { number: null, note: "Notiz ohne Nummer" },
        { number: 13, note: "Mammut 159" },
      ]),
    ).toEqual([
      { number: 12, containedIn: null },
      { number: 13, containedIn: "Mammut 159" },
    ]);
  });

  it("trimmt Notizen und macht leere Notizen zu null", () => {
    expect(buildAddItems([{ number: 7, note: "  " }])).toEqual([
      { number: 7, containedIn: null },
    ]);
  });
});

describe("parseSearchNumbers", () => {
  it("erkennt zwei und drei Nummern", () => {
    expect(parseSearchNumbers("12, 13")).toEqual({
      numbers: [12, 13],
      invalid: [],
      tooMany: false,
    });
    expect(parseSearchNumbers(" 12  13,14 ")).toEqual({
      numbers: [12, 13, 14],
      invalid: [],
      tooMany: false,
    });
  });

  it("behaelt die ersten drei Nummern und meldet zu viele", () => {
    expect(parseSearchNumbers("12, 13, 14, 15")).toEqual({
      numbers: [12, 13, 14],
      invalid: [],
      tooMany: true,
    });
  });

  it("nennt Ziffernfolgen ausserhalb des Bereichs", () => {
    expect(parseSearchNumbers("0, 12, 100000")).toEqual({
      numbers: [12],
      invalid: ["0", "100000"],
      tooMany: false,
    });
  });

  it("laesst Textsuche und einzelne Nummern unangetastet", () => {
    expect(parseSearchNumbers("Micky 219")).toBeNull();
    expect(parseSearchNumbers("219")).toBeNull();
    expect(parseSearchNumbers("219, Micky")).toBeNull();
  });
});

describe("toAddItems", () => {
  it("übernimmt Notizen und macht leere Notizen zu null", () => {
    expect(toAddItems([219, 13], [" MM 4 ", "  "])).toEqual([
      { number: 219, containedIn: "MM 4" },
      { number: 13, containedIn: null },
    ]);
  });
});
