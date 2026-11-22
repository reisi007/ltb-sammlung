import { Trans, useLingui } from "@lingui/react/macro";
import type { Catalog, Collection } from "../../lib/collection";
import { getCatalogEntry, getRowsForNumber } from "../../lib/collection";
import type { AddRowState, ParsedRow } from "./rows";

interface VolumeRowProps {
  row: AddRowState;
  entry: ParsedRow | undefined;
  autoFocus: boolean;
  canRemove: boolean;
  catalog: Catalog;
  collection: Collection;
  onValueChange: (id: number, value: string) => void;
  onNoteChange: (id: number, note: string) => void;
  onExpand: () => void;
  onScan: (id: number) => void;
  onRemove: (id: number) => void;
}

export function VolumeRow({
  row,
  entry,
  autoFocus,
  canRemove,
  catalog,
  collection,
  onValueChange,
  onNoteChange,
  onExpand,
  onScan,
  onRemove,
}: VolumeRowProps) {
  const { t } = useLingui();
  // Mehrere Nummern in einer Zeile werden erst beim Verlassen aufgeteilt;
  // bis dahin zeigt die Zeile bewusst keine Vorschau.
  const number =
    entry?.numbers.length === 1 ? entry.numbers[0] ?? null : null;
  const known = number === null ? null : getCatalogEntry(catalog, number);
  const owned =
    number === null ? 0 : getRowsForNumber(collection.ltb, number).length;
  const invalid = entry?.invalid ?? false;

  return (
    <div
      data-row-id={row.id}
      className="rounded-box bg-base-200 p-3"
    >
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="label-text text-xs">
            <Trans>Nummer</Trans>
          </span>
          <textarea
            rows={1}
            inputMode="numeric"
            className={
              invalid
                ? "textarea textarea-error w-full resize-none"
                : "textarea w-full resize-none"
            }
            placeholder={t`z. B. 219 oder LTB 219`}
            value={row.value}
            autoFocus={autoFocus}
            onChange={(event) => onValueChange(row.id, event.target.value)}
            onBlur={(event) => {
              // Klick auf Scan/Entfernen in derselben Zeile darf die
              // Zeile nicht vor dem Click neu aufbauen.
              const next = event.relatedTarget;

              if (
                next instanceof HTMLElement &&
                next.closest(`[data-row-id="${row.id}"]`) !== null
              ) {
                return;
              }

              onExpand();
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn-square btn-outline"
          aria-label={t`QR-Code scannen`}
          onClick={() => onScan(row.id)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />
          </svg>
        </button>
        <button
          type="button"
          className="btn btn-square btn-ghost"
          aria-label={t`Zeile entfernen`}
          disabled={!canRemove}
          onClick={() => onRemove(row.id)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <label className="mt-2 block">
        <span className="label-text text-xs">
          <Trans>Enthalten in (optional)</Trans>
        </span>
        <input
          type="text"
          className="input input-sm w-full"
          value={row.note}
          maxLength={200}
          placeholder={t`z. B. MM 4`}
          onChange={(event) => onNoteChange(row.id, event.target.value)}
        />
      </label>

      {number !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {known?.title != null ? (
            <span className="badge badge-success badge-sm badge-soft">
              <Trans>Bekannt: {known.title}</Trans>
            </span>
          ) : (
            <span className="badge badge-warning badge-sm badge-soft">
              <Trans>Nicht im Katalog</Trans>
            </span>
          )}
          {owned > 0 && (
            <span className="badge badge-ghost badge-sm">
              <Trans>Bereits {owned}× vorhanden</Trans>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
