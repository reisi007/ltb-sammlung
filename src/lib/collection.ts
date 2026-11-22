/**
 * Reine Datenlogik für die Sammlung und den Cover-/Titelkatalog.
 *
 * Dieser Einstiegspunkt re-exportiert die Typen, Parser und Abfragehelfer aus
 * `src/lib/collection/`. Wichtig: `containedIn` ist eine freie Notiz pro Zeile,
 * kein Fremdschlüssel. Zeilen werden weder dedupliziert noch verknüpft; die
 * Nummer 219 darf also zweimal vorkommen.
 */

import type { Catalog } from "./collection/types";
import { parseCatalog } from "./collection/parse";

export type {
  Catalog,
  CatalogEntry,
  CatalogMeta,
  Collection,
  CollectionMeta,
  CollectionRow,
  CollectionStats,
  SeriesCatalogEntry,
  SpecialSeries,
} from "./collection/types";

export { parseCatalog, parseCollection } from "./collection/parse";

export {
  formatCount,
  formatDateTime,
  getCatalogEntry,
  getOfficialCoverUrl,
  getRowsForNumber,
  getSeriesEntry,
  getStats,
  groupLtbRows,
  isNumberQuery,
  matchesQuery,
  parseExactNumber,
  type LtbRowGroup,
} from "./collection/lookup";

export async function loadCatalogData(): Promise<Catalog> {
  const module = await import("../data/catalog.json");

  return parseCatalog(module.default);
}
