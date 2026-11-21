/**
 * Lokaler Snapshot für den Entwicklungsbetrieb ohne API.
 *
 * Diese Datei wird **nur** im Dev-Modus dynamisch geladen. Ein
 * Produktions-Build enthält weder den Import noch die Sammlungsdaten: sonst
 * wäre die private Sammlung (Notizen, Sheet-ID) ohne Login als Asset
 * abrufbar. Für Tests und `npm run dev` bleibt der Snapshot verfügbar.
 */
import { parseCollection, type Collection } from "./collection";
import type { CollectionRepository } from "./repository";

export async function loadCollection(): Promise<Collection> {
  const module = await import("../data/collection.json");

  return parseCollection(module.default);
}

export function createSnapshotRepository(): CollectionRepository {
  return {
    id: "snapshot",
    capabilities: { write: false },
    load: loadCollection,
  };
}

export async function loadSnapshotRepository(): Promise<{
  repository: CollectionRepository;
  collection: Collection;
}> {
  return {
    repository: createSnapshotRepository(),
    collection: await loadCollection(),
  };
}
