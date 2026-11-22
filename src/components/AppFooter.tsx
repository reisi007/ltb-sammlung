import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import type { Locale } from "../i18n";
import { formatDateTime, type Catalog, type Collection } from "../lib/collection";

interface AppFooterProps {
  collection: Collection;
  catalog: Catalog;
  locale: Locale;
}

export function AppFooter({ collection, catalog, locale }: AppFooterProps) {
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
