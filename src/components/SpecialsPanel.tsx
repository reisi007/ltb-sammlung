import { Trans, useLingui } from "@lingui/react/macro";
import {
  getSeriesEntry,
  type Catalog,
} from "../lib/collection";
import { VolumeCount } from "./Counts";
import { SeriesCover } from "./SeriesCover";

interface SpecialsPanelProps {
  visibleSpecials: Array<{ name: string; numbers: number[] }>;
  catalog: Catalog;
  canWrite: boolean;
  onSeriesSelect: (series: string) => void;
  onAddVolume: (seriesName: string) => void;
  onCreateSeries: () => void;
}

export function SpecialsPanel({
  visibleSpecials,
  catalog,
  canWrite,
  onSeriesSelect,
  onAddVolume,
  onCreateSeries,
}: SpecialsPanelProps) {
  const { t } = useLingui();

  return (
    <section
      role="tabpanel"
      id="panel-specials"
      aria-labelledby="tab-specials"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            <Trans>Sonderserien</Trans>
          </h2>
          <p className="max-w-prose text-sm opacity-70">
            <Trans>
              Eigene Reihen mit eigenen Nummern, getrennt von den
              LTB-Nummern.
            </Trans>
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onCreateSeries}
          >
            <Trans>Reihe hinzufügen</Trans>
          </button>
        )}
      </div>

      {visibleSpecials.length > 0 && (
        <nav aria-label={t`Sonderserien`} className="flex flex-wrap gap-2">
          {visibleSpecials.map((series) => (
            <button
              key={series.name}
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => {
                onSeriesSelect(series.name);
                document
                  .getElementById(`serie-${series.name}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {series.name}
              <span className="badge badge-sm">{series.numbers.length}</span>
            </button>
          ))}
        </nav>
      )}

      {visibleSpecials.length === 0 ? (
        <div role="status" className="alert alert-info">
          <span>
            <Trans>Keine Sonderserien für diese Suche gefunden.</Trans>
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visibleSpecials.map((series) => (
            <section
              key={series.name}
              id={`serie-${series.name}`}
              className="card scroll-mt-4 bg-base-100 shadow-sm"
            >
              <div className="card-body gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="card-title text-base">{series.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="badge badge-ghost">
                      <VolumeCount count={series.numbers.length} />
                    </span>
                    {canWrite && (
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        onClick={() => onAddVolume(series.name)}
                      >
                        <Trans>Band hinzufügen</Trans>
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                  {series.numbers.map((number) => (
                    <div
                      key={number}
                      className="flex flex-col items-center gap-1"
                    >
                      <figure className="w-full overflow-hidden rounded-box bg-base-200">
                        <SeriesCover
                          number={number}
                          entry={getSeriesEntry(
                            catalog,
                            series.name,
                            number,
                          )}
                        />
                      </figure>
                      <span className="badge badge-sm badge-outline">
                        {number}
                      </span>
                    </div>
                  ))}
                  {canWrite && (
                    <button
                      type="button"
                      className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-box border-2 border-dashed border-base-300 text-base opacity-70 transition hover:border-primary hover:opacity-100"
                      aria-label={t`Band zu ${series.name} hinzufügen`}
                      onClick={() => onAddVolume(series.name)}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="size-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      <span className="text-xs">
                        <Trans>Band</Trans>
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
