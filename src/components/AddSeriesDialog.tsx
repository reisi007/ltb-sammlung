import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import {
  MAX_ADD_ITEMS,
  canonicalSeriesName,
  extractNumberFromScan,
  parseVolumeInput,
  validateAddNumbers,
} from "../lib/add";
import type { Catalog } from "../lib/collection";
import { getSeriesEntry } from "../lib/collection";
import { QrScanner } from "./QrScanner";

interface AddSeriesDialogProps {
  open: boolean;
  catalog: Catalog;
  seriesNames: readonly string[];
  initialSeries?: string;
  initialNumbers?: readonly number[];
  onClose: () => void;
  onAdd: (series: string, numbers: readonly number[]) => Promise<void>;
}

export function AddSeriesDialog({
  open,
  catalog,
  seriesNames,
  initialSeries,
  initialNumbers,
  onClose,
  onAdd,
}: AddSeriesDialogProps) {
  const { t } = useLingui();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [name, setName] = useState("");
  const [numbersText, setNumbersText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog === null) {
      return;
    }

    if (open && !dialog.open) {
      setName(
        initialSeries === undefined
          ? ""
          : canonicalSeriesName(initialSeries, seriesNames),
      );
      setNumbersText(
        initialNumbers === undefined || initialNumbers.length === 0
          ? ""
          : initialNumbers.join(", "),
      );
      setScanning(false);
      setSaving(false);
      setError(null);
      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialSeries, initialNumbers, seriesNames]);

  const numbers = parseVolumeInput(numbersText);
  const normalizedName = canonicalSeriesName(name, seriesNames);

  async function handleSubmit() {
    if (normalizedName === "") {
      setError(t`Bitte einen Namen für die Sonderserie eingeben.`);
      return;
    }

    if (normalizedName.length > 60) {
      setError(t`Der Name ist länger als 60 Zeichen.`);
      return;
    }

    const validation = validateAddNumbers(numbers);

    if (!validation.ok) {
      setError(
        validation.error === "too-many"
          ? t`Es sind höchstens ${MAX_ADD_ITEMS} Bände pro Vorgang möglich.`
          : t`Bitte 1 bis ${MAX_ADD_ITEMS} gültige Nummern eingeben.`,
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onAdd(normalizedName, validation.numbers);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : String(submitError),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="add-series-title"
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
      <div className="modal-box max-w-xl">
        <h2 id="add-series-title" className="card-title text-lg">
          <Trans>Sonderserie hinzufügen</Trans>
        </h2>
        <p className="mt-1 mb-4 text-sm opacity-70">
          <Trans>
            Reihe eingeben oder aus den Vorschlägen wählen und bis zu {MAX_ADD_ITEMS} Bände
            eintragen. Bereits vorhandene Bände werden übersprungen.
          </Trans>
        </p>

        {scanning ? (
          <QrScanner
            onStop={() => setScanning(false)}
            onDetected={(payload) => {
              const number = extractNumberFromScan(payload);

              if (number === null) {
                setError(t`Im Scan war keine Nummer erkennbar.`);
                setScanning(false);
                return;
              }

              setNumbersText((current) => {
                const parsed = parseVolumeInput(current);

                if (parsed.includes(number) || parsed.length >= MAX_ADD_ITEMS) {
                  return current;
                }

                return [...parsed, number].join(", ");
              });
              setScanning(false);
              setError(null);
            }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <label className="block">
              <span className="label-text text-xs">
                <Trans>Reihe</Trans>
              </span>
              <input
                type="text"
                list="series-name-options"
                className="input w-full"
                placeholder={t`z. B. LTB Phantomias Collection`}
                value={name}
                maxLength={60}
                disabled={initialSeries !== undefined}
                onChange={(event) => setName(event.target.value)}
              />
              <datalist id="series-name-options">
                {seriesNames.map((series) => (
                  <option key={series} value={series} />
                ))}
              </datalist>
              <span className="label-text-alt mt-1 block opacity-60">
                <Trans>
                  Vorschläge erscheinen beim Tippen; bekannte Kurzformen werden
                  auf den offiziellen Namen gesetzt.
                </Trans>
              </span>
            </label>

            <div className="flex items-end gap-2">
              <label className="flex-1">
                <span className="label-text text-xs">
                  <Trans>
                    Nummern (bis zu {MAX_ADD_ITEMS}; Komma, Semikolon oder
                    Zeilenumbruch)
                  </Trans>
                </span>
                <textarea
                  rows={1}
                  inputMode="numeric"
                  className="textarea w-full resize-none"
                  placeholder={t`z. B. 1, 2, 3`}
                  value={numbersText}
                  onChange={(event) => setNumbersText(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-square btn-outline"
                aria-label={t`QR-Code scannen`}
                onClick={() => {
                  setError(null);
                  setScanning(true);
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
            </div>

            {numbers.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {numbers.map((number) => {
                  const entry = getSeriesEntry(catalog, normalizedName, number);

                  return (
                    <li
                      key={number}
                      className={
                        entry?.title != null
                          ? "badge badge-success badge-lg badge-soft"
                          : "badge badge-warning badge-lg badge-soft"
                      }
                    >
                      <span className="font-semibold">{number}</span>
                      <span className="ml-1 max-w-56 truncate text-xs">
                        {entry?.title ?? <Trans>Nicht im Katalog</Trans>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {error !== null && (
              <div role="alert" className="alert alert-error alert-soft">
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose}>
            <Trans>Abbrechen</Trans>
          </button>
          {!scanning && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || normalizedName === "" || numbers.length === 0}
              onClick={() => {
                handleSubmit().catch(() => {
                  // Fehler landet bereits im Dialogzustand.
                });
              }}
            >
              {saving && (
                <span className="loading loading-spinner loading-sm" aria-hidden="true" />
              )}
              <Trans>Speichern</Trans>
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
