import { Trans, useLingui } from "@lingui/react/macro";

interface NumberGridProps {
  maxNumber: number;
  ownedNumbers: ReadonlySet<number>;
  onSelect: (number: number) => void;
}

export function NumberGrid({
  maxNumber,
  ownedNumbers,
  onSelect,
}: NumberGridProps) {
  const { t } = useLingui();
  const numbers = Array.from({ length: maxNumber }, (_, index) => index + 1);

  return (
    <section
      className="card bg-base-100 shadow-sm"
      aria-labelledby="nummern-uebersicht"
    >
      <div className="card-body gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="nummern-uebersicht" className="card-title text-base">
            <Trans>Nummern-Übersicht</Trans>
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="badge badge-sm">
              <Trans>vorhanden</Trans>
            </span>
            <span className="badge badge-sm badge-outline">
              <Trans>fehlt</Trans>
            </span>
            <span className="opacity-60">
              <Trans>
                vorhanden: {ownedNumbers.size} / {maxNumber}
              </Trans>
            </span>
          </div>
        </div>
        <div className="flex max-h-64 flex-wrap gap-1 overflow-y-auto sm:max-h-none sm:overflow-visible">
          {numbers.map((number) => {
            const owned = ownedNumbers.has(number);

            return (
              <button
                key={number}
                type="button"
                className={owned ? "btn btn-xs" : "btn btn-xs btn-outline"}
                aria-label={t`Nummer ${number} anzeigen`}
                onClick={() => onSelect(number)}
              >
                {number}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
