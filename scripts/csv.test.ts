import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parst einfache Zeilen mit LF", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("parst CRLF und entfernt ein BOM", () => {
    expect(parseCsv("\uFEFFNummer,Enthalten in\r\n13,\r\n31,Mammut 159\r\n")).toEqual([
      ["Nummer", "Enthalten in"],
      ["13", ""],
      ["31", "Mammut 159"],
    ]);
  });

  it("behandelt Kommas und Zeilenumbrüche in Anführungszeichen", () => {
    expect(parseCsv('a,"b,c"\n"zwei\nZeilen",d\n')).toEqual([
      ["a", "b,c"],
      ["zwei\nZeilen", "d"],
    ]);
  });

  it("behandelt verdoppelte Anführungszeichen als Escape", () => {
    expect(parseCsv('"Er sagte ""Hallo""",x\n')).toEqual([['Er sagte "Hallo"', "x"]]);
  });

  it("behält leere Felder und leere Zeilen am Ende nicht als Phantomzeile", () => {
    expect(parseCsv("a,b,\n,,\n")).toEqual([
      ["a", "b", ""],
      ["", "", ""],
    ]);
  });

  it("parst eine Datei ohne abschließenden Zeilenumbruch", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
