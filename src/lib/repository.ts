import type { Collection } from "./collection";
import { parseCollection } from "./collection";

/**
 * Datenzugriff für die Oberfläche.
 *
 * Die App kennt nur dieses Interface. Auf dem Server erfüllt die PHP-API den
 * Vertrag (Lesen und Schreiben). Im Dev-Betrieb gibt es ohne API einen
 * lesenden Snapshot; der Produktionsbuild enthält bewusst keinen.
 */
export interface CollectionRepository {
  readonly id: string;
  readonly capabilities: {
    readonly write: boolean;
  };
  load(): Promise<Collection>;
}

/**
 * Schreibvertrag. `occurrence` adressiert doppelte Nummern, weil die Sammlung
 * Zeilen bewusst nicht dedupliziert: 0 ist die erste Zeile mit dieser Nummer,
 * 1 die zweite und so weiter.
 */
export interface CollectionRowKey {
  readonly number: number;
  readonly occurrence: number;
}

export interface NewCollectionRow {
  readonly number: number;
  readonly containedIn: string | null;
}

export interface SeriesResult {
  readonly name: string;
  readonly added: number;
  readonly skipped: number;
}

export interface WritableCollectionRepository extends CollectionRepository {
  readonly capabilities: {
    readonly write: true;
  };
  addLtbRows(rows: readonly NewCollectionRow[]): Promise<number>;
  updateLtbRow(key: CollectionRowKey, containedIn: string | null): Promise<void>;
  removeLtbRow(key: CollectionRowKey): Promise<void>;
  addSeries(name: string, numbers: readonly number[]): Promise<SeriesResult>;
  addSeriesNumbers(name: string, numbers: readonly number[]): Promise<SeriesResult>;
  rememberIsbn(isbn: string, number: number): Promise<void>;
}

export function isWritableRepository(
  repository: CollectionRepository,
): repository is WritableCollectionRepository {
  return repository.capabilities.write;
}

/** Fehler der HTTP-API inklusive Status, damit die App 401 erkennen kann. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

async function requestJson(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    // Auch nach dem initialen Laden: eine abgelaufene Session beim Schreiben
    // soll zur Anmeldung fuehren, nicht nur eine Dialogfehlermeldung zeigen.
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login.html")
    ) {
      window.location.replace("/login.html");
    }

    let message = `HTTP ${response.status}`;

    try {
      const payload = (await response.json()) as { error?: unknown };

      if (typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      // Antwort ohne JSON — der Status reicht als Meldung.
    }

    throw new HttpError(message, response.status);
  }

  return response.json();
}

export function createHttpRepository(baseUrl = ""): WritableCollectionRepository {
  return {
    id: "http",
    capabilities: { write: true },
    async load() {
      const payload = await requestJson(`${baseUrl}/api/collection`);

      return parseCollection(payload);
    },
    async addLtbRows(rows) {
      if (rows.length === 0) {
        return 0;
      }

      const payload = (await requestJson(`${baseUrl}/api/ltb`, {
        method: "POST",
        body: JSON.stringify({ items: rows }),
      })) as { created?: unknown };

      return typeof payload.created === "number" ? payload.created : rows.length;
    },
    async updateLtbRow(key, containedIn) {
      await requestJson(`${baseUrl}/api/ltb`, {
        method: "PATCH",
        body: JSON.stringify({ ...key, containedIn }),
      });
    },
    async removeLtbRow(key) {
      await requestJson(`${baseUrl}/api/ltb`, {
        method: "DELETE",
        body: JSON.stringify(key),
      });
    },
    async addSeries(name, numbers) {
      const payload = (await requestJson(`${baseUrl}/api/series`, {
        method: "POST",
        body: JSON.stringify({ name, numbers }),
      })) as { name?: unknown; added?: unknown; skipped?: unknown };

      return {
        name: typeof payload.name === "string" ? payload.name : name,
        added: typeof payload.added === "number" ? payload.added : 0,
        skipped: typeof payload.skipped === "number" ? payload.skipped : 0,
      };
    },
    async rememberIsbn(isbn, number) {
      await requestJson(`${baseUrl}/api/isbn`, {
        method: "PUT",
        body: JSON.stringify({ isbn, number }),
      });
    },
    async addSeriesNumbers(name, numbers) {
      const payload = (await requestJson(`${baseUrl}/api/series/volume`, {
        method: "POST",
        body: JSON.stringify({ series: name, numbers }),
      })) as { series?: unknown; added?: unknown; skipped?: unknown };

      return {
        name: typeof payload.series === "string" ? payload.series : name,
        added: typeof payload.added === "number" ? payload.added : 0,
        skipped: typeof payload.skipped === "number" ? payload.skipped : 0,
      };
    },
  };
}

export interface InitialData {
  repository: CollectionRepository;
  collection: Collection;
}

/**
 * Lädt die Sammlung über die API. Nur im Dev-Betrieb fällt sie ohne API auf
 * den lokalen Snapshot zurück; im Produktionsbuild wird der Fehler
 * weitergereicht (401 → Anmeldung, sonst Fehlerbildschirm). Der Rückgabewert
 * enthält das Repository, damit die Oberfläche weiß, ob sie schreiben darf.
 */
export async function loadInitialData(): Promise<InitialData> {
  const http = createHttpRepository();

  try {
    const collection = await http.load();

    return { repository: http, collection };
  } catch (error) {
    // Nur im Dev-Betrieb ohne API auf den lokalen Snapshot zurückfallen.
    // Im Produktions-Build wäre der Snapshot ein öffentliches Asset und
    // würde die private Sammlung ohne Login ausliefern; dort muss ein 401
    // zur Anmeldung und ein 5xx als Fehler sichtbar werden.
    if (!import.meta.env.DEV) {
      throw error;
    }

    const { loadSnapshotRepository } = await import("./snapshot");

    return loadSnapshotRepository();
  }
}
