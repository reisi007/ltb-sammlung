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
  const [ratio, setRatio] = useState<number | null>(null);
  const sources = [entry?.coverUrl, entry?.coverUrlOfficial].filter(
    (url): url is string => url !== null && url !== undefined,
  );
  const source = sources.find((url) => !failedSources.includes(url)) ?? null;
  // Vor dem Laden reserviert 3/4 die Flaeche; danach folgt die Hoehe dem
  // echten Seitenverhaeltnis des Covers. So wird weder beschnitten noch
  // mit Balken skaliert.
  const frameStyle = { aspectRatio: `${ratio ?? 3 / 4}` };

  if (source === null) {
    return (
      <div
        className="flex w-full flex-col items-center justify-center gap-1 bg-base-200 p-2 text-center"
        style={frameStyle}
      >
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
    <div className="w-full" style={frameStyle}>
      <img
        src={source}
        alt={t`Cover von LTB Nr. ${number}`}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
        onLoad={(event) => {
          const image = event.currentTarget;

          if (image.naturalWidth > 0 && image.naturalHeight > 0) {
            setRatio(image.naturalWidth / image.naturalHeight);
          }
        }}
        onError={() => setFailedSources((current) => [...current, source])}
      />
    </div>
  );
}
