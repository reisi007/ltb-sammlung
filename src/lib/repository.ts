import type { Collection } from "./collection";
import { loadCollection, parseCollection } from "./collection";

/**
 * Datenzugriff für die Oberfläche.
 *
 * Die App kennt nur dieses Interface. Auf dem Server erfüllt die PHP-API den
 * Vertrag (Lesen und Schreiben); ohne API fällt die App auf den lokalen
 * Snapshot zurück und ist dann nur lesend.
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
}

export function isWritableRepository(
  repository: CollectionRepository,
): repository is WritableCollectionRepository {
  return repository.capabilities.write;
}

export function createSnapshotRepository(): CollectionRepository {
  return {
    id: "snapshot",
    capabilities: { write: false },
    load: loadCollection,
  };
}

export const snapshotRepository: CollectionRepository =
  createSnapshotRepository();

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
    let message = `HTTP ${response.status}`;

    try {
      const payload = (await response.json()) as { error?: unknown };

      if (typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      // Antwort ohne JSON — der Status reicht als Meldung.
    }

    throw new Error(message);
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
 * Lädt die Sammlung über die API und fällt ohne API auf den Snapshot zurück.
 * Der Rückgabewert enthält das Repository, damit die Oberfläche weiß, ob sie
 * schreiben darf.
 */
export async function loadInitialData(): Promise<InitialData> {
  const http = createHttpRepository();

  try {
    const collection = await http.load();

    return { repository: http, collection };
  } catch {
    return { repository: snapshotRepository, collection: await loadCollection() };
  }
}
