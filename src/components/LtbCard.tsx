import { Trans, useLingui } from "@lingui/react/macro";
import type { CatalogEntry, CollectionRow } from "../lib/collection";
import { Cover } from "./Cover";

interface LtbCardProps {
  row: CollectionRow;
  entry: CatalogEntry | null;
  /** Anzahl der Zeilen mit dieser Nummer (Duplikate bleiben erhalten). */
  copies: number;
  /** Alle Notizen der Zeilen, die diese Nummer teilen. */
  containedIn: readonly string[];
  onAddCopy?: (number: number) => void;
}

export function LtbCard({
  row,
  entry,
  copies,
  containedIn,
  onAddCopy,
}: LtbCardProps) {
  const { t } = useLingui();

  return (
    <article className="card bg-base-100 shadow-sm">
      <figure className="relative bg-base-200">
        <Cover number={row.number} title={entry?.title ?? null} entry={entry} />
        {copies > 1 && (
          <span
            className="absolute bottom-2 right-2 inline-flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-bold leading-none text-secondary-content shadow-lg ring-2 ring-base-100"
            role="img"
            title={t`${copies} Exemplare erfasst`}
            aria-label={t`${copies} Exemplare erfasst`}
          >
            ×{copies}
          </span>
        )}
      </figure>
      <div className="card-body gap-1 p-3">
        <h3 className="card-title text-base">
          <Trans>LTB Nr. {row.number}</Trans>
        </h3>
        <p className="line-clamp-2 min-h-10 text-sm opacity-80">
          {entry?.title ?? <Trans>Kein Titel erfasst</Trans>}
        </p>
        {containedIn.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs opacity-60">
              <Trans>Enthalten in</Trans>
            </span>
            {containedIn.map((note) => (
              <span key={note} className="badge badge-outline">
                {note}
              </span>
            ))}
          </div>
        )}
        {onAddCopy !== undefined && (
          <div className="card-actions mt-1 justify-end">
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => onAddCopy(row.number)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <Trans>Exemplar</Trans>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
