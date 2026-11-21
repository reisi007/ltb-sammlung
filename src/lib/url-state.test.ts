import { describe, expect, it } from "vitest";
import type { TabId, ViewState } from "./url-state";
import { buildViewPath, parseViewState } from "./url-state";

const ROOT = "/";
const PAGES = "/ltb-sammlung/";

function state(partial: Partial<ViewState> = {}): ViewState {
  return { tab: "ltb", query: "", showMissing: false, series: null, ...partial };
}

function split(path: string): { pathname: string; search: string } {
  const index = path.indexOf("?");

  return index === -1
    ? { pathname: path, search: "" }
    : { pathname: path.slice(0, index), search: path.slice(index) };
}

describe("Tab-Pfade", () => {
  it("bildet jeden Tab auf sein Pfadsegment ab und zurück", () => {
    const cases: Array<[TabId, string]> = [
      ["ltb", "ltb"],
      ["specials", "specials"],
      ["donaldDuck", "donald-duck"],
      ["panzerknacker", "panzerknacker"],
    ];

    for (const [tab, segment] of cases) {
      expect(buildViewPath(state({ tab }), ROOT)).toBe(`/${segment}`);
      expect(parseViewState(`/${segment}`, "", ROOT)).toEqual(state({ tab }));
    }
  });

  it("nutzt den Default-Tab für Wurzel, leeren Pfad und unbekannte Segmente", () => {
    expect(parseViewState("/", "", ROOT)).toEqual(state());
    expect(parseViewState("", "", ROOT)).toEqual(state());
    expect(parseViewState("/unbekannt", "?q=219", ROOT)).toEqual(
      state({ query: "219" }),
    );
    expect(parseViewState("/ltb/unterseite", "", ROOT)).toEqual(state());
  });
});

describe("Basispfad", () => {
  it("liest und schreibt Pfade unter /ltb-sammlung/", () => {
    expect(buildViewPath(state({ tab: "donaldDuck" }), PAGES)).toBe(
      "/ltb-sammlung/donald-duck",
    );
    expect(parseViewState("/ltb-sammlung/specials", "?q=219", PAGES)).toEqual(
      state({ tab: "specials", query: "219" }),
    );
    expect(parseViewState("/ltb-sammlung/", "", PAGES)).toEqual(state());
    expect(parseViewState("/ltb-sammlung", "", PAGES)).toEqual(state());
  });

  it("behandelt Pfade außerhalb der Basis als Default", () => {
    expect(parseViewState("/", "?q=219", PAGES)).toEqual(state({ query: "219" }));
    expect(parseViewState("/specials", "", PAGES)).toEqual(state());
  });
});

describe("Query-Parameter", () => {
  it("schreibt q, series und missing in stabiler Reihenfolge", () => {
    expect(
      buildViewPath(
        state({
          tab: "specials",
          query: "219",
          showMissing: true,
          series: "Young",
        }),
        ROOT,
      ),
    ).toBe("/specials?q=219&series=Young&missing=1");
  });

  it("kodiert Leerzeichen, Umlaute und Kaufmännische Und und dekodiert sie wieder", () => {
    const query = "Micky & Mäuschen 219";
    const path = buildViewPath(state({ query }), ROOT);

    expect(path).toBe("/ltb?q=Micky+%26+M%C3%A4uschen+219");
    const { pathname, search } = split(path);

    expect(parseViewState(pathname, search, ROOT)).toEqual(state({ query }));
  });

  it("behält mehrere Nummern und Leerzeichen in q unangetastet", () => {
    const parsed = parseViewState("/ltb", "?q=219%2C%20220%20und%20221", ROOT);

    expect(parsed.query).toBe("219, 220 und 221");
    expect(buildViewPath(parsed, ROOT)).toBe("/ltb?q=219%2C+220+und+221");
  });

  it("lässt ein leeres q beim Schreiben weg", () => {
    expect(buildViewPath(state({ query: "" }), ROOT)).toBe("/ltb");
    expect(parseViewState("/ltb", "?q=", ROOT)).toEqual(state());
  });

  it("setzt missing nur bei exakt 1", () => {
    expect(parseViewState("/ltb", "?missing=1", ROOT).showMissing).toBe(true);
    expect(buildViewPath(state({ showMissing: true }), ROOT)).toBe("/ltb?missing=1");

    for (const value of ["0", "true", "yes", "01", ""]) {
      expect(parseViewState("/ltb", `?missing=${value}`, ROOT).showMissing).toBe(
        false,
      );
    }
    expect(parseViewState("/ltb", "?missing", ROOT).showMissing).toBe(false);
    expect(buildViewPath(state({ showMissing: false }), ROOT)).toBe("/ltb");
  });

  it("verwendet series nur in den Sonderserien", () => {
    expect(parseViewState("/specials", "?series=Young", ROOT)).toEqual(
      state({ tab: "specials", series: "Young" }),
    );
    expect(
      buildViewPath(state({ tab: "specials", series: "Young" }), ROOT),
    ).toBe("/specials?series=Young");
    expect(parseViewState("/ltb", "?series=Young", ROOT)).toEqual(state());
    expect(buildViewPath(state({ series: "Young" }), ROOT)).toBe("/ltb");
    expect(parseViewState("/specials", "?series=", ROOT)).toEqual(
      state({ tab: "specials" }),
    );
    expect(buildViewPath(state({ tab: "specials", series: "" }), ROOT)).toBe(
      "/specials",
    );
  });

  it("dekodiert series mit Umlauten und Leerzeichen", () => {
    const parsed = parseViewState(
      "/specials",
      "?series=LTB+J%C3%BCnger%20Comics&foo=bar",
      ROOT,
    );

    expect(parsed.series).toBe("LTB Jünger Comics");
  });

  it("ignoriert unbekannte Parameter beim Lesen und entfernt sie beim Schreiben", () => {
    expect(
      parseViewState("/ltb", "?foo=bar&q=219&missing=1&nonsense=x", ROOT),
    ).toEqual(state({ query: "219", showMissing: true }));
    expect(
      buildViewPath(parseViewState("/ltb", "?foo=bar&q=219", ROOT), ROOT),
    ).toBe("/ltb?q=219");
  });
});

describe("Roundtrip", () => {
  it("stellt jeden gültigen Zustand aus dem erzeugten Pfad exakt wieder her", () => {
    const states: ViewState[] = [
      state(),
      state({ tab: "specials", query: "219 220", showMissing: true, series: "Young & Cool" }),
      state({ tab: "donaldDuck", query: "Mäuschen & Co" }),
      state({ tab: "panzerknacker", showMissing: true }),
    ];

    for (const original of states) {
      for (const base of [ROOT, PAGES]) {
        const { pathname, search } = split(buildViewPath(original, base));

        expect(parseViewState(pathname, search, base)).toEqual(original);
      }
    }
  });
});
