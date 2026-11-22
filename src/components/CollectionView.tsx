import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState, type ReactNode } from "react";
import { AddSeriesDialog } from "./AddSeriesDialog";
import { AddVolumesDialog } from "./AddVolumesDialog";
import { CollectionOverview } from "./CollectionOverview";
import { CollectionSearch } from "./CollectionSearch";
import { LtbPanel } from "./LtbPanel";
import { RowList } from "./RowList";
import { SpecialsPanel } from "./SpecialsPanel";
import { parseSearchNumbers, type AddItem } from "../lib/add";
import {
  getCatalogEntry,
  getStats,
  isNumberQuery,
  matchesQuery,
  type Catalog,
  type Collection,
} from "../lib/collection";
import type { SeriesResult } from "../lib/repository";
import type { TabId } from "../lib/url-state";
import type { Locale } from "../i18n";

interface CollectionViewProps {
  collection: Collection;
  catalog: Catalog;
  locale: Locale;
  query: string;
  activeTab: TabId;
  showMissing: boolean;
  series: string | null;
  canWrite: boolean;
  onQueryChange: (query: string) => void;
  onTabChange: (tab: TabId) => void;
  onShowMissingChange: (showMissing: boolean) => void;
  onSeriesSelect: (series: string) => void;
  onSelectNumber: (number: number) => void;
  onAddVolumes: (items: readonly AddItem[]) => Promise<void>;
  onAddSeries: (
    series: string,
    numbers: readonly number[],
  ) => Promise<SeriesResult>;
  onRememberIsbn: (isbn: string, number: number) => Promise<void>;
}

export function CollectionView({
  collection,
  catalog,
  locale,
  query,
  activeTab,
  showMissing,
  series,
  canWrite,
  onQueryChange,
  onTabChange,
  onShowMissingChange,
  onSeriesSelect,
  onSelectNumber,
  onAddVolumes,
  onAddSeries,
  onRememberIsbn,
}: CollectionViewProps) {
  const { t } = useLingui();
  const stats = getStats(collection);
  const ownedNumbers = new Set(collection.ltb.map((row) => row.number));
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
  const numericQuery = isNumberQuery(query);

  // Ein Deep Link mit ?series=… (und Zurück/Vorwärts) springt nach dem
  // Rendern zur passenden Sektion.
  useEffect(() => {
    if (activeTab !== "specials" || series === null) {
      return;
    }

    document
      .getElementById(`serie-${series}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeTab, series]);

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
    { id: "donaldDuck", label: <Trans>Donald Duck & Co</Trans> },
    { id: "panzerknacker", label: <Trans>Panzerknacker & Co</Trans> },
  ];

  function selectNumber(number: number) {
    onSelectNumber(number);
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
      <CollectionOverview stats={stats} locale={locale} />

      <CollectionSearch
        collection={collection}
        catalog={catalog}
        query={query}
        canWrite={canWrite}
        feedback={feedback}
        onQueryChange={onQueryChange}
        onOpenAddDialog={openAddDialog}
      />

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
        <LtbPanel
          rows={filteredLtb}
          catalog={catalog}
          query={query}
          gridMaxNumber={gridMaxNumber}
          ownedNumbers={ownedNumbers}
          showMissing={showMissing}
          onShowMissingChange={onShowMissingChange}
          onSelect={selectNumber}
          onAddCopy={canWrite ? (number) => openAddDialog([number]) : undefined}
        />
      )}

      {activeTab === "specials" && (
        <SpecialsPanel
          visibleSpecials={visibleSpecials}
          catalog={catalog}
          canWrite={canWrite}
          onSeriesSelect={onSeriesSelect}
          onAddVolume={(seriesName) => {
            setFeedback(null);
            setSeriesDialog({ series: seriesName });
          }}
          onCreateSeries={() => {
            setFeedback(null);
            setSeriesDialog({});
          }}
        />
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
              <Trans>Donald Duck & Co</Trans>
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
            ...Object.keys(catalog.series).filter(
              (name) => name !== "Donald Duck" && name !== "Panzerknacker & Co",
            ),
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
