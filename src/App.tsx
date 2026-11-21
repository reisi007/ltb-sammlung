import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState, type ReactNode } from "react";
import { AddSeriesDialog } from "./components/AddSeriesDialog";
import { AddVolumesDialog } from "./components/AddVolumesDialog";
import {
  MatchCount,
  NumberCount,
  RowCount,
  VolumeCount,
} from "./components/Counts";
import { LtbCard } from "./components/LtbCard";
import { NumberGrid } from "./components/NumberGrid";
import { RowList } from "./components/RowList";
import { SeriesCover } from "./components/SeriesCover";
import { isLocale, loadCatalog as loadMessages, type Locale } from "./i18n";
import {
  MAX_SEARCH_NUMBERS,
  getDuplicateNumbers,
  parseSearchNumbers,
  type AddItem,
} from "./lib/add";
import {
  formatCount,
  formatDateTime,
  getCatalogEntry,
  getRowsForNumber,
  getSeriesEntry,
  getStats,
  isNumberQuery,
  loadCatalogData,
  matchesQuery,
  parseExactNumber,
  type Catalog,
  type Collection,
} from "./lib/collection";
import {
  HttpError,
  isWritableRepository,
  loadInitialData,
  type CollectionRepository,
  type SeriesResult,
} from "./lib/repository";

type TabId = "ltb" | "specials" | "donaldDuck" | "panzerknacker";

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      collection: Collection;
      catalog: Catalog;
      repository: CollectionRepository;
    }
  | { status: "error"; message: string };

interface AppProps {
  initialLocale: Locale;
  repository?: CollectionRepository;
}

interface HeaderProps {
  locale: Locale;
  switching: boolean;
  onLocaleChange: (locale: Locale) => void;
  onLogout?: () => void;
}

function Header({ locale, switching, onLocaleChange, onLogout }: HeaderProps) {
  const { t } = useLingui();

  return (
    <header className="bg-base-200">
      <div className="navbar mx-auto w-full max-w-7xl gap-2 px-4">
        <div className="navbar-start">
          <div>
            <p className="text-lg font-bold leading-tight">
              <Trans>LTB-Sammlung</Trans>
            </p>
            <p className="hidden text-xs opacity-70 sm:block">
              <Trans>Meine Lustiges-Taschenbuch-Sammlung</Trans>
            </p>
          </div>
        </div>
        <div className="navbar-end gap-2">
          <label className="flex items-center gap-2">
            <span className="hidden text-sm sm:inline">
              <Trans>Sprache</Trans>
            </span>
            <select
              className="select select-sm"
              value={locale}
              disabled={switching}
              aria-label={t`Sprache`}
              onChange={(event) => {
                const nextLocale = event.target.value;

                if (isLocale(nextLocale)) {
                  onLocaleChange(nextLocale);
                }
              }}
            >
              <option value="de">{t`Deutsch`}</option>
              <option value="en">{t`Englisch`}</option>
            </select>
          </label>
          {switching && (
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
          )}
          {onLogout !== undefined && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onLogout}
            >
              <Trans>Abmelden</Trans>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

interface FooterProps {
  collection: Collection;
  catalog: Catalog;
  locale: Locale;
}

function Footer({ collection, catalog, locale }: FooterProps) {
  const sources: Array<{ href: string; label: ReactNode }> = [
    {
      href: "https://de.duckipedia.org/wiki/Covergalerie_Lustiges_Taschenbuch",
      label: <Trans>Duckipedia Covergalerie</Trans>,
    },
    {
      href: "https://de.duckipedia.org/wiki/Ausgabenliste_Lustiges_Taschenbuch",
      label: <Trans>Duckipedia Ausgabenliste</Trans>,
    },
    {
      href: "https://www.lustiges-taschenbuch.de/",
      label: <Trans>Offizielle LTB-Seite</Trans>,
    },
  ];

  return (
    <footer className="footer sm:footer-horizontal mx-auto w-full max-w-7xl gap-6 bg-base-200 p-6 text-sm">
      <nav>
        <h2 className="footer-title">
          <Trans>Datenquellen</Trans>
        </h2>
        {sources.map((source) => (
          <a
            key={source.href}
            href={source.href}
            target="_blank"
            rel="noreferrer"
            className="link link-hover"
          >
            {source.label}
          </a>
        ))}
      </nav>
      <div className="max-w-prose space-y-1">
        <p>
          <Trans>
            Sammlung synchronisiert: {formatDateTime(collection.meta.syncedAt, locale)}
          </Trans>
        </p>
        <p>
          <Trans>
            Cover und Titel synchronisiert: {formatDateTime(catalog.meta.syncedAt, locale)}
          </Trans>
        </p>
        <p className="opacity-70">
          <Trans>
            „Enthalten in“ ist eine freie Notiz pro Zeile – keine Verknüpfung.
          </Trans>
        </p>
        <p className="opacity-70">
          <Trans>
            Cover: © Disney/Egmont. Die Rechte liegen bei den jeweiligen
            Rechteinhabern; Cover werden nur verlinkt, nicht gehostet.
          </Trans>
        </p>
        <p className="opacity-70">
          <Trans>
            Kein offizielles Angebot von Disney oder Egmont.
          </Trans>
        </p>
        <p className="opacity-60">Version {__APP_VERSION__}</p>
      </div>
    </footer>
  );
}

interface CollectionViewProps {
  collection: Collection;
  catalog: Catalog;
  locale: Locale;
  query: string;
  activeTab: TabId;
  canWrite: boolean;
  onQueryChange: (query: string) => void;
  onTabChange: (tab: TabId) => void;
  onAddVolumes: (items: readonly AddItem[]) => Promise<void>;
  onAddSeries: (
    series: string,
    numbers: readonly number[],
  ) => Promise<SeriesResult>;
  onRememberIsbn: (isbn: string, number: number) => Promise<void>;
}

function CollectionView({
  collection,
  catalog,
  locale,
  query,
  activeTab,
  canWrite,
  onQueryChange,
  onTabChange,
  onAddVolumes,
  onAddSeries,
  onRememberIsbn,
}: CollectionViewProps) {
  const { t } = useLingui();
  const stats = getStats(collection);
  const ownedNumbers = new Set(collection.ltb.map((row) => row.number));
  const duplicates = getDuplicateNumbers(collection.ltb);
  // Die Nummern-Übersicht darf nicht von einer einzelnen Fehleingabe
  // (z. B. 99999) auf zehntausende Schaltflächen aufgeblasen werden.
  const knownMaxNumber = catalog.entries.reduce(
    (max, entry) => Math.max(max, entry.number),
    0,
  );
  const gridMaxNumber =
    knownMaxNumber > 0
      ? Math.min(stats.maxLtbNumber, knownMaxNumber)
      : Math.min(stats.maxLtbNumber, 999);
  const [addOpen, setAddOpen] = useState(false);
  const [addNumbers, setAddNumbers] = useState<readonly number[] | undefined>();
  const [seriesDialog, setSeriesDialog] = useState<{
    series?: string;
    numbers?: readonly number[];
  } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const multiQuery = parseSearchNumbers(query);
  const numberFilter =
    multiQuery !== null && multiQuery.numbers.length > 0
      ? new Set(multiQuery.numbers)
      : null;
  const exactNumber = parseExactNumber(query);
  const exactRows =
    exactNumber === null ? [] : getRowsForNumber(collection.ltb, exactNumber);
  const exactEntry =
    exactNumber === null ? null : getCatalogEntry(catalog, exactNumber);
  const numericQuery = isNumberQuery(query);

  const filteredLtb = collection.ltb
    .filter((row) =>
      numberFilter !== null
        ? numberFilter.has(row.number)
        : matchesQuery(
            row.number,
            getCatalogEntry(catalog, row.number)?.title ?? null,
            query,
          ),
    )
    .sort((a, b) => a.number - b.number);

  const visibleSpecials = collection.specials
    .map((series) => ({
      name: series.name,
      numbers:
        numberFilter !== null
          ? series.numbers.filter((number) => numberFilter.has(number))
          : numericQuery
            ? series.numbers.filter((number) =>
                matchesQuery(number, null, query),
              )
            : series.numbers,
    }))
    .filter(
      (series) =>
        numberFilter === null && !numericQuery
          ? true
          : series.numbers.length > 0,
    );

  const filteredDonaldDuck =
    numberFilter !== null
      ? collection.donaldDuck.filter((row) => numberFilter.has(row.number))
      : numericQuery
        ? collection.donaldDuck.filter((row) =>
            matchesQuery(row.number, null, query),
          )
        : collection.donaldDuck;

  const filteredPanzerknacker =
    numberFilter !== null
      ? collection.panzerknacker.filter((row) => numberFilter.has(row.number))
      : numericQuery
        ? collection.panzerknacker.filter((row) =>
            matchesQuery(row.number, null, query),
          )
        : collection.panzerknacker;

  const tabs: Array<{ id: TabId; label: ReactNode }> = [
    { id: "ltb", label: <Trans>LTB</Trans> },
    { id: "specials", label: <Trans>Sonderserien</Trans> },
    { id: "donaldDuck", label: <Trans>Donald Duck</Trans> },
    { id: "panzerknacker", label: <Trans>Panzerknacker & Co</Trans> },
  ];

  function selectNumber(number: number) {
    onQueryChange(String(number));
    onTabChange("ltb");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openAddDialog(numbers?: readonly number[]) {
    setFeedback(null);
    setAddNumbers(numbers);
    setAddOpen(true);
  }

  async function handleAdd(items: readonly AddItem[]) {
    await onAddVolumes(items);
    setFeedback(
      items.length === 1
        ? t`${items.length} Band hinzugefügt.`
        : t`${items.length} Bände hinzugefügt.`,
    );
  }

  async function handleAddSeries(series: string, numbers: readonly number[]) {
    const result = await onAddSeries(series, numbers);
    setFeedback(
      result.skipped > 0
        ? t`${result.name}: ${result.added} Bände gespeichert, ${result.skipped} bereits vorhanden.`
        : t`${result.name}: ${result.added} Bände gespeichert.`,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label={t`Überblick`}>
        <div className="stats stats-vertical w-full shadow-sm sm:stats-horizontal">
          <div className="stat">
            <div className="stat-title">
              <Trans>LTB</Trans>
            </div>
            <div className="stat-value text-2xl">
              {formatCount(stats.ltbNumbers, locale)}
            </div>
            <div className="stat-desc">
              <RowCount count={stats.ltbRows} />
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">
              <Trans>Sonderserien</Trans>
            </div>
            <div className="stat-value text-2xl">
              {formatCount(stats.specialsSeries, locale)}
            </div>
            <div className="stat-desc">
              <NumberCount count={stats.specialsNumbers} />
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">
              <Trans>Donald Duck</Trans>
            </div>
            <div className="stat-value text-2xl">
              {formatCount(stats.donaldDuckNumbers, locale)}
            </div>
            <div className="stat-desc">
              <NumberCount count={stats.donaldDuckNumbers} />
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">
              <Trans>Panzerknacker & Co</Trans>
            </div>
            <div className="stat-value text-2xl">
              {formatCount(stats.panzerknackerNumbers, locale)}
            </div>
            <div className="stat-desc">
              <NumberCount count={stats.panzerknackerNumbers} />
            </div>
          </div>
        </div>
      </section>

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
                  onClick={() => openAddDialog()}
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
                  onClick={() => openAddDialog([exactNumber])}
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
                    onClick={() => {
                      setFeedback(null);
                      openAddDialog(multiQuery.numbers);
                    }}
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

      <div
        role="tablist"
        aria-label={t`Bereiche`}
        className="tabs tabs-border flex-nowrap overflow-x-auto"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`tab whitespace-nowrap ${
              activeTab === tab.id ? "tab-active" : ""
            }`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "ltb" && (
        <section
          role="tabpanel"
          id="panel-ltb"
          aria-labelledby="tab-ltb"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">
                <Trans>Meine LTB-Ausgaben</Trans>
              </h2>
              <p className="max-w-prose text-sm opacity-70">
                <Trans>
                  Jede Zeile ist ein eigener Eintrag. „Enthalten in“ ist eine
                  freie Notiz, keine Verknüpfung.
                </Trans>
              </p>
            </div>
            <span className="badge badge-lg">
              <MatchCount count={filteredLtb.length} />
            </span>
          </div>

          <NumberGrid
            maxNumber={gridMaxNumber}
            ownedNumbers={ownedNumbers}
            onSelect={selectNumber}
          />

          {filteredLtb.length === 0 ? (
            <div role="status" className="alert alert-info">
              <span>
                {query.trim() === "" ? (
                  <Trans>Keine LTB-Ausgaben erfasst.</Trans>
                ) : (
                  <Trans>Keine LTB-Ausgaben für „{query}“ gefunden.</Trans>
                )}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filteredLtb.map((row, index) => (
                <LtbCard
                  key={`${row.number}-${index}`}
                  row={row}
                  entry={getCatalogEntry(catalog, row.number)}
                  copies={duplicates.get(row.number) ?? 1}
                  onAddCopy={canWrite ? (number) => openAddDialog([number]) : undefined}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "specials" && (
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
                onClick={() => {
                  setFeedback(null);
                  setSeriesDialog({});
                }}
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
                            onClick={() => {
                              setFeedback(null);
                              setSeriesDialog({ series: series.name });
                            }}
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
                          <figure className="aspect-[3/4] w-full overflow-hidden rounded-box bg-base-200">
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
                          onClick={() => {
                            setFeedback(null);
                            setSeriesDialog({ series: series.name });
                          }}
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
      )}

      {activeTab === "donaldDuck" && (
        <section
          role="tabpanel"
          id="panel-donaldDuck"
          aria-labelledby="tab-donaldDuck"
          className="flex flex-col gap-4"
        >
          <div>
            <h2 className="text-xl font-bold">
              <Trans>Donald Duck</Trans>
            </h2>
            <p className="max-w-prose text-sm opacity-70">
              <Trans>Eigene Reihe mit eigenen Nummern.</Trans>
            </p>
          </div>
          <RowList
            rows={filteredDonaldDuck}
            catalog={catalog}
            seriesName="Donald Duck"
          />
        </section>
      )}

      {activeTab === "panzerknacker" && (
        <section
          role="tabpanel"
          id="panel-panzerknacker"
          aria-labelledby="tab-panzerknacker"
          className="flex flex-col gap-4"
        >
          <div>
            <h2 className="text-xl font-bold">
              <Trans>Panzerknacker & Co</Trans>
            </h2>
            <p className="max-w-prose text-sm opacity-70">
              <Trans>Eigene Reihe mit eigenen Nummern.</Trans>
            </p>
          </div>
          <RowList
            rows={filteredPanzerknacker}
            catalog={catalog}
            seriesName="Panzerknacker & Co"
          />
        </section>
      )}

      <AddVolumesDialog
        open={addOpen}
        catalog={catalog}
        collection={collection}
        initialNumbers={addNumbers}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
        onRememberIsbn={onRememberIsbn}
      />

      <AddSeriesDialog
        open={seriesDialog !== null}
        catalog={catalog}
        seriesNames={[
          ...new Set([
            ...collection.specials.map((series) => series.name),
            ...Object.keys(catalog.series),
          ]),
        ].sort((a, b) => a.localeCompare(b, "de"))}
        initialSeries={seriesDialog?.series}
        initialNumbers={seriesDialog?.numbers}
        onClose={() => setSeriesDialog(null)}
        onAdd={handleAddSeries}
      />
    </div>
  );
}

export default function App({
  initialLocale,
  repository: fixedRepository,
}: AppProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [switchingLocale, setSwitchingLocale] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("ltb");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const catalog = await loadCatalogData();

      if (fixedRepository !== undefined) {
        return {
          repository: fixedRepository,
          collection: await fixedRepository.load(),
          catalog,
        };
      }

      const initial = await loadInitialData();

      return { ...initial, catalog };
    }

    load()
      .then(({ repository, collection, catalog }) => {
        if (!cancelled) {
          setLoadState({ status: "ready", collection, catalog, repository });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        // Ohne gültige Session führt die App zur Anmeldung, statt einen
        // nicht behebbaren Ladefehler zu zeigen.
        if (error instanceof HttpError && error.status === 401) {
          window.location.replace("/login.html");
          return;
        }

        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fixedRepository]);

  async function handleAddVolumes(items: readonly AddItem[]) {
    if (loadState.status !== "ready") {
      throw new Error("Daten sind noch nicht geladen.");
    }

    const { repository } = loadState;

    if (!isWritableRepository(repository)) {
      throw new Error("Schreiben ist ohne API nicht möglich.");
    }

    await repository.addLtbRows(items);
    const collection = await repository.load();

    setLoadState((current) =>
      current.status === "ready" ? { ...current, collection } : current,
    );
  }

  async function handleAddSeries(
    series: string,
    numbers: readonly number[],
  ): Promise<SeriesResult> {
    if (loadState.status !== "ready") {
      throw new Error("Daten sind noch nicht geladen.");
    }

    const { repository } = loadState;

    if (!isWritableRepository(repository)) {
      throw new Error("Schreiben ist ohne API nicht möglich.");
    }

    const result = await repository.addSeries(series, numbers);
    const collection = await repository.load();

    setLoadState((current) =>
      current.status === "ready" ? { ...current, collection } : current,
    );

    return result;
  }

  async function handleRememberIsbn(isbn: string, number: number) {
    if (loadState.status !== "ready") {
      throw new Error("Daten sind noch nicht geladen.");
    }

    const { repository } = loadState;

    if (!isWritableRepository(repository)) {
      throw new Error("Schreiben ist ohne API nicht möglich.");
    }

    await repository.rememberIsbn(isbn, number);
    const collection = await repository.load();

    setLoadState((current) =>
      current.status === "ready" ? { ...current, collection } : current,
    );
  }

  async function handleLogout() {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      // ?switch=1 verhindert, dass die Login-Seite wegen einer noch
      // gueltigen Session sofort wieder zurueckleitet. So ist ein
      // Benutzerwechsel auch dann moeglich, wenn der Logout-Request
      // fehlschlaegt.
      window.location.replace("/login.html?switch=1");
    }
  }

  async function handleLocaleChange(nextLocale: Locale) {
    if (nextLocale === locale) {
      return;
    }

    setSwitchingLocale(true);

    try {
      await loadMessages(nextLocale);
      setLocale(nextLocale);
    } catch (error) {
      console.error("Der Sprachkatalog konnte nicht geladen werden.", error);
    } finally {
      setSwitchingLocale(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        locale={locale}
        switching={switchingLocale}
        onLocaleChange={handleLocaleChange}
        onLogout={
          loadState.status === "ready" &&
          loadState.repository.capabilities.write
            ? () => {
                handleLogout().catch(() => {
                  // Der finally-Zweig leitet in jedem Fall zur Anmeldung.
                });
              }
            : undefined
        }
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6">
        {loadState.status === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
            <span className="loading loading-spinner loading-lg" aria-hidden="true" />
            <p className="text-sm opacity-70">
              <Trans>Daten werden geladen…</Trans>
            </p>
          </div>
        )}

        {loadState.status === "error" && (
          <div role="alert" className="alert alert-error">
            <div>
              <h2 className="font-semibold">
                <Trans>Daten konnten nicht geladen werden.</Trans>
              </h2>
              <p className="text-sm">{loadState.message}</p>
            </div>
          </div>
        )}

        {loadState.status === "ready" && (
          <CollectionView
            collection={loadState.collection}
            catalog={loadState.catalog}
            locale={locale}
            query={query}
            activeTab={activeTab}
            canWrite={loadState.repository.capabilities.write}
            onQueryChange={setQuery}
            onTabChange={setActiveTab}
            onAddVolumes={handleAddVolumes}
            onAddSeries={handleAddSeries}
            onRememberIsbn={handleRememberIsbn}
          />
        )}
      </main>

      {loadState.status === "ready" && (
        <Footer
          collection={loadState.collection}
          catalog={loadState.catalog}
          locale={locale}
        />
      )}
    </div>
  );
}
