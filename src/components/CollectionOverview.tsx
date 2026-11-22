import { Trans, useLingui } from "@lingui/react/macro";
import type { Locale } from "../i18n";
import {
  formatCount,
  type CollectionStats,
} from "../lib/collection";
import { NumberCount, RowCount } from "./Counts";

interface CollectionOverviewProps {
  stats: CollectionStats;
  locale: Locale;
}

export function CollectionOverview({ stats, locale }: CollectionOverviewProps) {
  const { t } = useLingui();

  return (
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
            <Trans>Donald Duck & Co</Trans>
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
  );
}
