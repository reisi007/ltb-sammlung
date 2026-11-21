import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { CatalogEntry } from "../lib/collection";

interface CoverProps {
  number: number;
  title: string | null;
  entry: CatalogEntry | null;
}

export function Cover({ number, title, entry }: CoverProps) {
  const { t } = useLingui();
  const [failedSources, setFailedSources] = useState<readonly string[]>([]);
  const sources = [entry?.coverUrl, entry?.coverUrlOfficial].filter(
    (url): url is string => url !== null && url !== undefined,
  );
  const source = sources.find((url) => !failedSources.includes(url)) ?? null;

  if (source === null) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-base-200 p-2 text-center">
        <span className="text-sm font-semibold">
          {title !== null ? (
            <Trans>
              Nr. {number} – {title}
            </Trans>
          ) : (
            <Trans>Nr. {number}</Trans>
          )}
        </span>
        <span className="text-xs opacity-70">
          <Trans>Kein Cover verfügbar</Trans>
        </span>
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={t`Cover von LTB Nr. ${number}`}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
      onError={() => setFailedSources((current) => [...current, source])}
    />
  );
}
