import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState, type ReactNode } from "react";
import {
  MatchCount,
  NumberCount,
  RowCount,
  VolumeCount,
} from "./components/Counts";
import { LtbCard } from "./components/LtbCard";
import { NumberGrid } from "./components/NumberGrid";
import { RowList } from "./components/RowList";
import { isLocale, loadCatalog as loadMessages, type Locale } from "./i18n";
import {
  formatCount,
  formatDateTime,
  getCatalogEntry,
  getRowsForNumber,
  getStats,
  isNumberQuery,
  loadCatalogData,
  matchesQuery,
  parseExactNumber,
  type Catalog,
  type Collection,
} from "./lib/collection";
import {
  snapshotRepository,
  type CollectionRepository,
} from "./lib/repository";

type TabId = "ltb" | "specials" | "donaldDuck" | "panzerknacker";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; collection: Collection; catalog: Catalog }
  | { status: "error"; message: string };

interface AppProps {
  initialLocale: Locale;
  repository?: CollectionRepository;
}

interface HeaderProps {
  locale: Locale;
  switching: boolean;
  onLocaleChange: (locale: Locale) => void;
}

function Header({ locale, switching, onLocaleChange }: HeaderProps) {
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
      href: collection.meta.sheetUrl,
      label: <Trans>Google Sheet</Trans>,
    },
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
            Kein offizielles Angebot von Disney, Egmont oder Google.
          </Trans>
        </p>
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
  onQueryChange: (query: string) => void;
  onTabChange: (tab: TabId) => void;
}

function CollectionView({
  collection,
  catalog,
  locale,
  query,
  activeTab,
  onQueryChange,
  onTabChange,
}: CollectionViewProps) {
  const { t } = useLingui();
  const stats = getStats(collection);
  const ownedNumbers = new Set(collection.ltb.map((row) => row.number));
  const exactNumber = parseExactNumber(query);
  const exactRows =
    exactNumber === null ? [] : getRowsForNumber(collection.ltb, exactNumber);
  const exactEntry =
    exactNumber === null ? null : getCatalogEntry(catalog, exactNumber);
  const numericQuery = isNumberQuery(query);

  const filteredLtb = collection.ltb
    .filter((row) =>
      matchesQuery(
        row.number,
        getCatalogEntry(catalog, row.number)?.title ?? null,
        query,
      ),
    )
    .sort((a, b) => a.number - b.number);

  const visibleSpecials = collection.specials
    .map((series) => ({
      name: series.name,
      numbers: numericQuery
        ? series.numbers.filter((number) =>
            matchesQuery(number, null, query),
          )
        : series.numbers,
    }))
    .filter((series) => !numericQuery || series.numbers.length > 0);

  const filteredDonaldDuck = numericQuery
    ? collection.donaldDuck.filter((row) =>
        matchesQuery(row.number, null, query),
      )
    : collection.donaldDuck;

  const filteredPanzerknacker = numericQuery
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
              <div
                className="tooltip tooltip-bottom"
                data-tip={t`Kamera-Scan ist noch nicht umgesetzt.`}
              >
                <button
                  type="button"
                  className="btn btn-sm btn-disabled"
                  aria-disabled="true"
                  tabIndex={-1}
                >
                  <Trans>QR-Scan folgt später</Trans>
                </button>
              </div>
              <div
                className="tooltip tooltip-bottom"
                data-tip={t`Schreiben direkt ins Google Sheet per OAuth ist geplant.`}
              >
                <button
                  type="button"
                  className="btn btn-sm btn-disabled"
                  aria-disabled="true"
                  tabIndex={-1}
                >
                  <Trans>Bearbeiten folgt</Trans>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              className="input w-full"
              value={query}
              placeholder={t`Nummer oder Titel suchen`}
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
            </div>
          )}
        </div>
      </section>

      <div role="tablist" aria-label={t`Bereiche`} className="tabs tabs-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={activeTab === tab.id ? "tab tab-active" : "tab"}
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
            maxNumber={stats.maxLtbNumber}
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

          {visibleSpecials.length === 0 ? (
            <div role="status" className="alert alert-info">
              <span>
                <Trans>Keine Sonderserien für diese Suche gefunden.</Trans>
              </span>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visibleSpecials.map((series) => (
                <section key={series.name} className="card bg-base-100 shadow-sm">
                  <div className="card-body gap-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="card-title text-base">{series.name}</h3>
                      <span className="badge badge-ghost">
                        <VolumeCount count={series.numbers.length} />
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {series.numbers.map((number) => (
                        <span key={number} className="badge badge-outline">
                          {number}
                        </span>
                      ))}
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
          <RowList rows={filteredDonaldDuck} />
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
          <RowList rows={filteredPanzerknacker} />
        </section>
      )}
    </div>
  );
}

export default function App({
  initialLocale,
  repository = snapshotRepository,
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

    Promise.all([repository.load(), loadCatalogData()])
      .then(([collection, catalog]) => {
        if (!cancelled) {
          setLoadState({ status: "ready", collection, catalog });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repository]);

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
            onQueryChange={setQuery}
            onTabChange={setActiveTab}
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
