import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpRepository } from "./repository";

const collectionPayload = {
  meta: {
    sheetId: "sheet-id",
    sheetUrl: "https://example.test/sheet",
    syncedAt: "2026-11-21T12:00:00.000Z",
    source: "sqlite",
    user: "admin",
  },
  ltb: [{ number: 219, containedIn: "MM 4" }],
  specials: [{ name: "LTB Spezial", numbers: [1, 2] }],
  donaldDuck: [],
  panzerknacker: [],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createHttpRepository", () => {
  it("liest die Sammlung über /api/collection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(collectionPayload));
    vi.stubGlobal("fetch", fetchMock);

    const collection = await createHttpRepository().load();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/collection",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
    expect(collection.ltb).toEqual([{ number: 219, containedIn: "MM 4" }]);
    expect(collection.specials[0].numbers).toEqual([1, 2]);
  });

  it("schickt die Einträge als items an /api/ltb", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ created: 2, rows: [] }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const created = await createHttpRepository().addLtbRows([
      { number: 12, containedIn: null },
      { number: 12, containedIn: "Zweites" },
    ]);

    expect(created).toBe(2);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(path).toBe("/api/ltb");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      items: [
        { number: 12, containedIn: null },
        { number: 12, containedIn: "Zweites" },
      ],
    });
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
  });

  it("legt eine Sonderserie mit Nummern an", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ name: "Legacy", added: 3, skipped: 0 }, 201),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createHttpRepository().addSeries("Legacy", [1, 2, 3]);

    expect(result).toEqual({ name: "Legacy", added: 3, skipped: 0 });
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(path).toBe("/api/series");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Legacy",
      numbers: [1, 2, 3],
    });
  });

  it("merkt sich eine ISBN-Zuordnung", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await createHttpRepository().rememberIsbn("9783770402199", 219);

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(path).toBe("/api/isbn");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      isbn: "9783770402199",
      number: 219,
    });
  });

  it("übernimmt die Fehlermeldung der API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: "Es können 1 bis 3 Bände pro Vorgang angelegt werden." }, 422),
      ),
    );

    await expect(
      createHttpRepository().addLtbRows([{ number: 1, containedIn: null }]),
    ).rejects.toThrow(/1 bis 3 Bände/);
  });

  it("meldet den HTTP-Status, wenn die Antwort kein JSON ist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("kaputt", { status: 500 })),
    );

    await expect(createHttpRepository().load()).rejects.toThrow("HTTP 500");
  });
});
