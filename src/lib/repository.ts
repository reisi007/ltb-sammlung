import type { Collection } from "./collection";
import { loadCollection } from "./collection";

/**
 * Datenzugriff für die Oberfläche.
 *
 * Die App kennt nur dieses Interface. Aktuell wird ausschließlich der lokale
 * Snapshot gelesen. Eine spätere API-Implementierung (PHP + SQLite, Issue #2)
 * kann denselben Vertrag erfüllen und zusätzlich den Schreibvertrag unten
 * anbieten, ohne dass die Anzeige umgebaut werden muss.
 */
export interface CollectionRepository {
  readonly id: string;
  readonly capabilities: {
    readonly write: boolean;
  };
  load(): Promise<Collection>;
}

/**
 * Zukünftiger Schreibvertrag. `occurrence` adressiert doppelte Nummern, weil
 * die Sammlung Zeilen bewusst nicht dedupliziert: 0 ist die erste Zeile mit
 * dieser Nummer, 1 die zweite und so weiter.
 */
export interface CollectionRowKey {
  readonly number: number;
  readonly occurrence: number;
}

export interface WritableCollectionRepository extends CollectionRepository {
  readonly capabilities: {
    readonly write: true;
  };
  addLtbRow(number: number, containedIn: string | null): Promise<void>;
  updateLtbRow(key: CollectionRowKey, containedIn: string | null): Promise<void>;
  removeLtbRow(key: CollectionRowKey): Promise<void>;
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
