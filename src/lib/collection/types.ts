/**
 * Typen der Sammlung und des Cover-/Titelkatalogs.
 *
 * Wichtig: `containedIn` ist eine freie Notiz pro Zeile, kein Fremdschlüssel.
 * Zeilen werden weder dedupliziert noch verknüpft; die Nummer 219 darf also
 * zweimal vorkommen.
 */

export interface CollectionMeta {
  sheetId: string;
  sheetUrl: string;
  syncedAt: string;
}

export interface CollectionRow {
  number: number;
  containedIn: string | null;
}

export interface SpecialSeries {
  name: string;
  numbers: number[];
}

export interface Collection {
  meta: CollectionMeta;
  ltb: CollectionRow[];
  /** Gelernte ISBN-13 (normalisiert) => LTB-Nummer, aus dem Scanner. */
  isbnMap: Record<string, number>;
  specials: SpecialSeries[];
  donaldDuck: CollectionRow[];
  panzerknacker: CollectionRow[];
}

export interface CatalogMeta {
  sources: string[];
  syncedAt: string;
}

export interface CatalogEntry {
  number: number;
  title: string | null;
  coverUrl: string | null;
  coverUrlOfficial: string | null;
  /** ISBN-13 des Bandes, wenn die Quelle sie liefert. */
  isbn: string | null;
}

export interface SeriesCatalogEntry {
  number: number;
  title: string | null;
  coverUrl: string | null;
}

export interface Catalog {
  meta: CatalogMeta;
  entries: CatalogEntry[];
  series: Record<string, SeriesCatalogEntry[]>;
}

export interface CollectionStats {
  ltbRows: number;
  ltbNumbers: number;
  maxLtbNumber: number;
  specialsSeries: number;
  specialsNumbers: number;
  donaldDuckNumbers: number;
  panzerknackerNumbers: number;
}
