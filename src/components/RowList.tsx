import { Trans } from "@lingui/react/macro";
import type { CollectionRow } from "../lib/collection";

interface RowListProps {
  rows: CollectionRow[];
}

export function RowList({ rows }: RowListProps) {
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
    <ul className="flex flex-wrap gap-2">
      {rows.map((row, index) => (
        <li
          key={`${row.number}-${index}`}
          className="flex items-center gap-2 rounded-box bg-base-100 px-3 py-2 shadow-sm"
        >
          <span className="font-semibold">
            <Trans>Nr. {row.number}</Trans>
          </span>
          {row.containedIn !== null && (
            <span className="badge badge-outline">{row.containedIn}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
