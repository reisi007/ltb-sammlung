import { Trans } from "@lingui/react/macro";
import type { CatalogEntry, CollectionRow } from "../lib/collection";
import { Cover } from "./Cover";

interface LtbCardProps {
  row: CollectionRow;
  entry: CatalogEntry | null;
  copies?: number;
}

export function LtbCard({ row, entry, copies = 1 }: LtbCardProps) {
  return (
    <article className="card bg-base-100 shadow-sm">
      <figure className="aspect-[3/4] bg-base-200">
        <Cover number={row.number} title={entry?.title ?? null} entry={entry} />
      </figure>
      <div className="card-body gap-1 p-3">
        <h3 className="card-title text-base">
          <Trans>LTB Nr. {row.number}</Trans>
          {copies > 1 && (
            <span
              className="badge badge-secondary badge-sm"
              title={`${copies} Exemplare erfasst`}
            >
              ×{copies}
            </span>
          )}
        </h3>
        <p className="line-clamp-2 min-h-10 text-sm opacity-80">
          {entry?.title ?? <Trans>Kein Titel erfasst</Trans>}
        </p>
        {row.containedIn !== null && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs opacity-60">
              <Trans>Enthalten in</Trans>
            </span>
            <span className="badge badge-outline">{row.containedIn}</span>
          </div>
        )}
      </div>
    </article>
  );
}
