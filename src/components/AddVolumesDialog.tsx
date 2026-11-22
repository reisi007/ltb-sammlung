import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAddItems,
  extractNumberFromScan,
  validateAddNumbers,
  type AddValidationError,
} from "../lib/add";
import { resolveScan } from "../lib/isbn";
import { QrScanner } from "./QrScanner";
import { IsbnPrompt } from "./AddVolumesDialog/IsbnPrompt";
import { ValidationMessage } from "./AddVolumesDialog/ValidationMessage";
import { VolumeRow } from "./AddVolumesDialog/VolumeRow";
import {
  createRow,
  expandRows,
  parseRows,
  type AddRowState,
} from "./AddVolumesDialog/rows";
import type { AddVolumesDialogProps } from "./AddVolumesDialog/types";

type DialogError =
  | { kind: "validation"; error: AddValidationError }
  | { kind: "text"; message: string };

export function AddVolumesDialog({
  open,
  catalog,
  collection,
  initialNumbers,
  onClose,
  onAdd,
  onRememberIsbn,
}: AddVolumesDialogProps) {
  const { t } = useLingui();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [rows, setRows] = useState<AddRowState[]>(() => [createRow()]);
  const [scanRow, setScanRow] = useState<number | null>(null);
  const [pendingIsbn, setPendingIsbn] = useState<string | null>(null);
  const [isbnTarget, setIsbnTarget] = useState<number | null>(null);
  const [isbnNumber, setIsbnNumber] = useState("");
  const [isbnSaving, setIsbnSaving] = useState(false);
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
      setPendingIsbn(null);
      setIsbnTarget(null);
      setIsbnNumber("");
      setIsbnSaving(false);
      setError(null);
      setSaving(false);

      if (initialNumbers !== undefined && initialNumbers.length > 0) {
        setRows(
          initialNumbers.map((number) => createRow(String(number))),
        );
      }

      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialNumbers]);

  const parsed = useMemo(() => parseRows(rows), [rows]);

  const numbers = parsed.flatMap((entry) => entry.numbers);

  const invalidRow = parsed.find((entry) => entry.invalid);

  function updateRowValue(id: number, value: string) {
    setRows((current) =>
      current.map((item) => (item.id === id ? { ...item, value } : item)),
    );
  }

  function updateRowNote(id: number, note: string) {
    setRows((current) =>
      current.map((item) => (item.id === id ? { ...item, note } : item)),
    );
  }

  function removeRow(id: number) {
    setRows((current) => current.filter((item) => item.id !== id));
  }

  async function assignIsbn() {
    if (pendingIsbn === null) {
      return;
    }

    const number = extractNumberFromScan(isbnNumber);

    if (number === null) {
      setError({
        kind: "text",
        message: t`Bitte eine gültige LTB-Nummer eingeben.`,
      });
      return;
    }

    setIsbnSaving(true);
    setError(null);

    try {
      await onRememberIsbn(pendingIsbn, number);
      setRows((current) =>
        current.map((row) =>
          row.id === isbnTarget ? { ...row, value: String(number) } : row,
        ),
      );
      setPendingIsbn(null);
      setIsbnTarget(null);
      setIsbnNumber("");
    } catch (assignError) {
      setError({
        kind: "text",
        message:
          assignError instanceof Error
            ? assignError.message
            : String(assignError),
      });
    } finally {
      setIsbnSaving(false);
    }
  }

  async function handleSubmit() {
    const expandedRows = expandRows(rows);

    if (expandedRows !== rows) {
      setRows(expandedRows);
    }

    const submittedItems = buildAddItems(
      expandedRows.map((row) => ({
        number:
          row.value.trim() === "" ? null : extractNumberFromScan(row.value),
        note: row.note,
      })),
    );
    const invalidSubmittedRow = expandedRows.find(
      (row) => row.value.trim() !== "" && extractNumberFromScan(row.value) === null,
    );

    if (invalidSubmittedRow !== undefined) {
      setError({ kind: "text", message: t`Eine Nummer konnte nicht gelesen werden.` });
      return;
    }

    const validation = validateAddNumbers(
      submittedItems.map((item) => item.number),
    );

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
      await onAdd(submittedItems);
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
            Bis zu 200 Bände auf einmal. Mehrere Nummern mit Komma,
            Semikolon oder Zeilenumbruch trennen; unbekannte Nummern und
            doppelte Exemplare sind erlaubt.
          </Trans>
        </p>

        {scanRow !== null ? (
          <QrScanner
            onStop={() => setScanRow(null)}
            onDetected={(payload) => {
              const target = scanRow;
              const result = resolveScan(payload, catalog, collection.isbnMap);
              setScanRow(null);

              if (result.kind === "unknown-isbn") {
                setPendingIsbn(result.isbn);
                setIsbnTarget(target);
                setError(null);
                return;
              }

              if (result.kind === "invalid") {
                setError({
                  kind: "text",
                  message: t`Im Scan war keine LTB-Nummer oder ISBN erkennbar.`,
                });
                return;
              }

              setRows((current) =>
                current.map((row) =>
                  row.id === target
                    ? { ...row, value: String(result.number) }
                    : row,
                ),
              );
              setError(null);
            }}
          />
        ) : (
          <>
            {pendingIsbn !== null && (
              <IsbnPrompt
                isbn={pendingIsbn}
                value={isbnNumber}
                saving={isbnSaving}
                onChange={setIsbnNumber}
                onAssign={() => {
                  assignIsbn().catch(() => {
                    // Fehler landet bereits im Dialogzustand.
                  });
                }}
              />
            )}
            <form
              id="add-volumes-form"
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmit().catch(() => {
                  // Fehler landet bereits im Dialogzustand.
                });
              }}
            >
              {rows.map((row, index) => (
                <VolumeRow
                  key={row.id}
                  row={row}
                  entry={parsed[index]}
                  autoFocus={index === rows.length - 1 && rows.length === 1}
                  canRemove={rows.length > 1}
                  catalog={catalog}
                  collection={collection}
                  onValueChange={updateRowValue}
                  onNoteChange={updateRowNote}
                  onExpand={() => setRows((current) => expandRows(current))}
                  onScan={(id) => {
                    setError(null);
                    setScanRow(id);
                  }}
                  onRemove={removeRow}
                />
              ))}

              <button
                type="button"
                className="btn btn-sm btn-ghost self-start"
                onClick={() => setRows((current) => [...current, createRow()])}
              >
                <Trans>Weiterer Band</Trans>
              </button>

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
            </form>
          </>
        )}

        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose}>
            <Trans>Abbrechen</Trans>
          </button>
          {scanRow === null && (
            <button
              type="submit"
              form="add-volumes-form"
              className="btn btn-primary"
              disabled={saving || numbers.length === 0 || invalidRow !== undefined}
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
