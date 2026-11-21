import { Trans } from "@lingui/react/macro";
import type { Catalog, CollectionRow } from "../lib/collection";
import { getSeriesEntry } from "../lib/collection";
import { SeriesCover } from "./SeriesCover";

interface RowListProps {
  rows: CollectionRow[];
  catalog: Catalog;
  seriesName: string;
}

/**
 * Kartenliste für Reihen, die als eigene Sammlungsliste geführt werden
 * (Donald Duck, Panzerknacker & Co). Cover und Titel kommen aus dem Katalog;
 * fehlt ein Eintrag, bleibt der bisherige Platzhalter.
 */
export function RowList({ rows, catalog, seriesName }: RowListProps) {
  if (rows.length === 0) {
    return (
      <div role="status" className="alert alert-info">
        <span>
          <Trans>Keine Einträge für diese Suche.</Trans>
        </span>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {rows.map((row, index) => (
        <li key={`${row.number}-${index}`} className="flex flex-col gap-1">
          <figure className="aspect-[3/4] overflow-hidden rounded-box bg-base-200">
            <SeriesCover
              number={row.number}
              entry={getSeriesEntry(catalog, seriesName, row.number)}
            />
          </figure>
          <div className="flex flex-wrap items-center gap-1">
            <span className="badge badge-sm badge-outline">
              <Trans>Nr. {row.number}</Trans>
            </span>
            {row.containedIn !== null && (
              <span className="badge badge-sm">{row.containedIn}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
