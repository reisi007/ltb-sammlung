import { Trans } from "@lingui/react/macro";
import {
  getCatalogEntry,
  groupLtbRows,
  type Catalog,
  type CollectionRow,
} from "../lib/collection";
import { MatchCount } from "./Counts";
import { LtbCard } from "./LtbCard";
import { NumberGrid } from "./NumberGrid";

interface LtbPanelProps {
  rows: CollectionRow[];
  catalog: Catalog;
  query: string;
  gridMaxNumber: number;
  ownedNumbers: ReadonlySet<number>;
  showMissing: boolean;
  onShowMissingChange: (showMissing: boolean) => void;
  onSelect: (number: number) => void;
  onAddCopy?: (number: number) => void;
}

export function LtbPanel({
  rows,
  catalog,
  query,
  gridMaxNumber,
  ownedNumbers,
  showMissing,
  onShowMissingChange,
  onSelect,
  onAddCopy,
}: LtbPanelProps) {
  return (
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
          <MatchCount count={rows.length} />
        </span>
      </div>

      <NumberGrid
        maxNumber={gridMaxNumber}
        ownedNumbers={ownedNumbers}
        showMissing={showMissing}
        onShowMissingChange={onShowMissingChange}
        onSelect={onSelect}
      />

      {rows.length === 0 ? (
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
          {groupLtbRows(rows).map((group) => (
            <LtbCard
              key={group.number}
              row={group.rows[0]}
              entry={getCatalogEntry(catalog, group.number)}
              copies={group.rows.length}
              containedIn={[
                ...new Set(
                  group.rows
                    .map((row) => row.containedIn)
                    .filter((note): note is string => note !== null),
                ),
              ]}
              onAddCopy={onAddCopy}
            />
          ))}
        </div>
      )}
    </section>
  );
}
