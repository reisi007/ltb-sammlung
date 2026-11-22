import { Trans, useLingui } from "@lingui/react/macro";
import { MAX_SEARCH_NUMBERS, parseSearchNumbers } from "../lib/add";
import {
  getCatalogEntry,
  getRowsForNumber,
  parseExactNumber,
  type Catalog,
  type Collection,
} from "../lib/collection";
import { RowCount } from "./Counts";

interface CollectionSearchProps {
  collection: Collection;
  catalog: Catalog;
  query: string;
  canWrite: boolean;
  feedback: string | null;
  onQueryChange: (query: string) => void;
  onOpenAddDialog: (numbers?: readonly number[]) => void;
}

export function CollectionSearch({
  collection,
  catalog,
  query,
  canWrite,
  feedback,
  onQueryChange,
  onOpenAddDialog,
}: CollectionSearchProps) {
  const { t } = useLingui();
  const multiQuery = parseSearchNumbers(query);
  const exactNumber = parseExactNumber(query);
  const exactRows =
    exactNumber === null ? [] : getRowsForNumber(collection.ltb, exactNumber);
  const exactEntry =
    exactNumber === null ? null : getCatalogEntry(catalog, exactNumber);

  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title text-lg">
            <Trans>Suche</Trans>
          </h2>
          <div className="flex flex-wrap gap-2">
            {canWrite ? (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => onOpenAddDialog()}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <Trans>Bände hinzufügen</Trans>
              </button>
            ) : (
              <div
                className="tooltip tooltip-bottom"
                data-tip={t`Schreiben ist ohne API nicht möglich (nur Lesezugriff).`}
              >
                <button
                  type="button"
                  className="btn btn-sm btn-disabled"
                  aria-disabled="true"
                  tabIndex={-1}
                >
                  <Trans>Nur Lesen</Trans>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            className="input w-full"
            value={query}
            placeholder={t`Nummern (bis zu 3) oder Titel suchen`}
            aria-label={t`Suche`}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <button
            type="button"
            className="btn"
            disabled={query === ""}
            onClick={() => onQueryChange("")}
          >
            <Trans>Zurücksetzen</Trans>
          </button>
        </div>

        {exactNumber !== null && (
          <div className="flex flex-wrap items-center gap-2 rounded-box bg-base-200 px-3 py-2">
            <span className="font-semibold">
              <Trans>LTB Nr. {exactNumber}</Trans>
            </span>
            {exactEntry?.title != null && (
              <span className="text-sm opacity-80">{exactEntry.title}</span>
            )}
            <span
              className={
                exactRows.length > 0
                  ? "badge badge-success"
                  : "badge badge-ghost"
              }
            >
              {exactRows.length > 0 ? (
                <Trans>Habe ich: Ja</Trans>
              ) : (
                <Trans>Habe ich: Nein</Trans>
              )}
            </span>
            {exactRows.length > 1 && (
              <span className="text-xs opacity-70">
                <Trans>mehrfach erfasst</Trans> (<RowCount count={exactRows.length} />)
              </span>
            )}
            {canWrite && exactNumber !== null && (
              <button
                type="button"
                className="btn btn-xs btn-outline ml-auto"
                onClick={() => onOpenAddDialog([exactNumber])}
              >
                {exactRows.length > 0 ? (
                  <Trans>Weiteres Exemplar</Trans>
                ) : (
                  <Trans>Hinzufügen</Trans>
                )}
              </button>
            )}
          </div>
        )}


        {multiQuery !== null && (
          <div className="rounded-box bg-base-200 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                <Trans>Nummern</Trans>
              </span>
              {multiQuery.numbers.map((number) => {
                const rows = getRowsForNumber(collection.ltb, number);
                const entry = getCatalogEntry(catalog, number);

                return (
                  <span
                    key={number}
                    className={
                      rows.length > 0
                        ? "badge badge-success badge-lg"
                        : "badge badge-ghost badge-lg"
                    }
                  >
                    Nr. {number}
                    {entry?.title != null && (
                      <span className="ml-1 max-w-52 truncate text-xs opacity-80">
                        {entry.title}
                      </span>
                    )}
                    <span className="ml-1 text-xs">
                      {rows.length > 0 ? (
                        <Trans>Habe ich ({rows.length}×)</Trans>
                      ) : (
                        <Trans>Habe ich: Nein</Trans>
                      )}
                    </span>
                  </span>
                );
              })}
              {multiQuery.invalid.map((token) => (
                <span key={token} className="badge badge-error badge-lg">
                  <Trans>Ungültig: {token}</Trans>
                </span>
              ))}
              {canWrite && multiQuery.numbers.length > 0 && (
                <button
                  type="button"
                  className="btn btn-xs btn-primary ml-auto"
                  onClick={() => onOpenAddDialog(multiQuery.numbers)}
                >
                  <Trans>Alle hinzufügen</Trans>
                </button>
              )}
            </div>
            {multiQuery.tooMany && (
              <p className="mt-1 text-xs opacity-70">
                <Trans>
                  Höchstens {MAX_SEARCH_NUMBERS} Nummern auf einmal; weitere
                  werden ignoriert.
                </Trans>
              </p>
            )}
          </div>
        )}

        {feedback !== null && (
          <div role="status" className="alert alert-success alert-soft">
            <span>{feedback}</span>
          </div>
        )}
      </div>
    </section>
  );
}
