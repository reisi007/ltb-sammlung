import type { IndexHtmlTransformContext } from "vite";
import { describe, expect, it } from "vitest";
import { CSP_POLICY, cspIndexHtmlHook } from "../../vite.config";

// OutputBundle wird von Vite nicht direkt exportiert; der Typ aus dem
// Kontext haelt den Test an die echte Hook-Signatur.
type Bundle = NonNullable<IndexHtmlTransformContext["bundle"]>;

const html = [
  "<!doctype html>",
  "<html><head>",
  "  <title>Test</title>",
  "</head><body></body></html>",
].join("\n");

function context(bundle?: Bundle): IndexHtmlTransformContext {
  return {
    path: "/index.html",
    filename: "index.html",
    bundle,
  };
}

describe("CSP-Meta im HTML", () => {
  it("injiziert die Policy im Build-Kontext", () => {
    const result = cspIndexHtmlHook(html, context({}));

    expect(result).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(result).toContain(CSP_POLICY);
    expect(result).toContain("default-src 'self'");
    expect(result).toContain("script-src 'self'");
    expect(result.indexOf('<meta http-equiv="Content-Security-Policy"'))
      .toBeLessThan(result.indexOf("</head>"));
  });

  it("laesst das HTML im Dev-Kontext unveraendert", () => {
    expect(cspIndexHtmlHook(html, context(undefined))).toBe(html);
  });
});
