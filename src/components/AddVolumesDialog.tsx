import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_ADD_ITEMS,
  MAX_VOLUME_NUMBER,
  extractNumberFromScan,
  toAddItems,
  validateAddNumbers,
  type AddItem,
  type AddValidationError,
} from "../lib/add";
import type { Catalog, Collection } from "../lib/collection";
import { getCatalogEntry, getRowsForNumber } from "../lib/collection";
import { QrScanner } from "./QrScanner";

interface AddRowState {
  id: number;
  value: string;
  note: string;
}

interface AddVolumesDialogProps {
  open: boolean;
  catalog: Catalog;
  collection: Collection;
  initialNumbers?: readonly number[];
  onClose: () => void;
  onAdd: (items: readonly AddItem[]) => Promise<void>;
}

let nextRowId = 1;

function createRow(value = ""): AddRowState {
  return { id: nextRowId++, value, note: "" };
}

type DialogError =
  | { kind: "validation"; error: AddValidationError }
  | { kind: "text"; message: string };

function ValidationMessage({ error }: { error: AddValidationError }) {
  switch (error) {
    case "empty":
      return <Trans>Bitte mindestens eine Nummer eingeben.</Trans>;
    case "too-many":
      return (
        <Trans>Es sind höchstens {MAX_ADD_ITEMS} Bände pro Vorgang möglich.</Trans>
      );
    case "invalid-number":
      return <Trans>Eine Nummer ist keine ganze Zahl.</Trans>;
    case "number-out-of-range":
      return (
        <Trans>Nummern müssen zwischen 1 und {MAX_VOLUME_NUMBER} liegen.</Trans>
      );
  }
}

export function AddVolumesDialog({
  open,
  catalog,
  collection,
  initialNumbers,
  onClose,
  onAdd,
}: AddVolumesDialogProps) {
  const { t } = useLingui();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [rows, setRows] = useState<AddRowState[]>(() => [createRow()]);
  const [scanRow, setScanRow] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<DialogError | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog === null) {
      return;
    }

    if (open && !dialog.open) {
      setRows([createRow()]);
      setScanRow(null);
      setError(null);
      setSaving(false);

      if (initialNumbers !== undefined && initialNumbers.length > 0) {
        setRows(
          initialNumbers
            .slice(0, MAX_ADD_ITEMS)
            .map((number) => createRow(String(number))),
        );
      }

      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialNumbers]);

  const parsed = useMemo(
    () =>
      rows.map((row) => {
        const numbers = row.value.trim() === "" ? [] : [extractNumberFromScan(row.value)];

        return { row, number: numbers[0] ?? null };
      }),
    [rows],
  );

  const numbers = parsed
    .map((entry) => entry.number)
    .filter((number): number is number => number !== null);

  const invalidRow = parsed.find(
    (entry) => entry.row.value.trim() !== "" && entry.number === null,
  );

  async function handleSubmit() {
    if (invalidRow !== undefined) {
      setError({ kind: "text", message: t`Eine Nummer konnte nicht gelesen werden.` });
      return;
    }

    const validation = validateAddNumbers(numbers);

    if (!validation.ok) {
      setError(
        validation.error === null
          ? { kind: "text", message: t`Ungültige Eingabe.` }
          : { kind: "validation", error: validation.error },
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onAdd(toAddItems(numbers, rows.map((row) => row.note)));
      onClose();
    } catch (submitError) {
      setError({
        kind: "text",
        message:
          submitError instanceof Error ? submitError.message : String(submitError),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="add-volumes-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) {
          onClose();
        }
      }}
    >
      <div className="modal-box max-w-2xl">
        <h2 id="add-volumes-title" className="card-title text-lg">
          <Trans>Bände hinzufügen</Trans>
        </h2>
        <p className="mt-1 mb-4 text-sm opacity-70">
          <Trans>
            Bis zu {MAX_ADD_ITEMS} Bände auf einmal. Unbekannte Nummern und
            doppelte Exemplare sind erlaubt.
          </Trans>
        </p>

        {scanRow !== null ? (
          <QrScanner
            onStop={() => setScanRow(null)}
            onDetected={(payload) => {
              const number = extractNumberFromScan(payload);

              if (number === null) {
                setError({
                  kind: "text",
                  message: t`Im Scan war keine LTB-Nummer erkennbar.`,
                });
                setScanRow(null);
                return;
              }

              setRows((current) =>
                current.map((row) =>
                  row.id === scanRow ? { ...row, value: String(number) } : row,
                ),
              );
              setScanRow(null);
              setError(null);
            }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((row, index) => {
              const entry = parsed[index];
              const number = entry?.number ?? null;
              const known = number === null ? null : getCatalogEntry(catalog, number);
              const owned = number === null ? 0 : getRowsForNumber(collection.ltb, number).length;
              const invalid = row.value.trim() !== "" && number === null;

              return (
                <div key={row.id} className="rounded-box bg-base-200 p-3">
                  <div className="flex items-end gap-2">
                    <label className="flex-1">
                      <span className="label-text text-xs">
                        <Trans>Nummer</Trans>
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={
                          invalid ? "input input-error w-full" : "input w-full"
                        }
                        placeholder={t`z. B. 219 oder LTB 219`}
                        value={row.value}
                        autoFocus={index === rows.length - 1 && rows.length === 1}
                        onChange={(event) => {
                          const value = event.target.value;
                          setRows((current) =>
                            current.map((item) =>
                              item.id === row.id ? { ...item, value } : item,
                            ),
                          );
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-square btn-outline"
                      aria-label={t`QR-Code scannen`}
                      onClick={() => {
                        setError(null);
                        setScanRow(row.id);
                      }}
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
                      disabled={rows.length === 1}
                      onClick={() =>
                        setRows((current) =>
                          current.filter((item) => item.id !== row.id),
                        )
                      }
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
                      onChange={(event) => {
                        const note = event.target.value;
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, note } : item,
                          ),
                        );
                      }}
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
            })}

            {rows.length < MAX_ADD_ITEMS && (
              <button
                type="button"
                className="btn btn-sm btn-ghost self-start"
                onClick={() => setRows((current) => [...current, createRow()])}
              >
                <Trans>Weiterer Band</Trans>
              </button>
            )}

            {error !== null && (
              <div role="alert" className="alert alert-error alert-soft">
                <span>
                  {error.kind === "validation" ? (
                    <ValidationMessage error={error.error} />
                  ) : (
                    error.message
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose}>
            <Trans>Abbrechen</Trans>
          </button>
          {scanRow === null && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || numbers.length === 0 || invalidRow !== undefined}
              onClick={() => {
                handleSubmit().catch(() => {
                  // Fehler landet bereits im Dialogzustand.
                });
              }}
            >
              {saving && (
                <span className="loading loading-spinner loading-sm" aria-hidden="true" />
              )}
              <Trans>Hinzufügen</Trans>
            </button>
          )}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit" onClick={onClose}>
          <Trans>Schließen</Trans>
        </button>
      </form>
    </dialog>
  );
}
