import { useState } from "react";
import type { SeriesCatalogEntry } from "../lib/collection";

interface SeriesCoverProps {
  number: number;
  entry: SeriesCatalogEntry | null;
}

export function SeriesCover({ number, entry }: SeriesCoverProps) {
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const source = entry?.coverUrl ?? null;
  // Ohne geladenes Bild reserviert 3/4 den Platz; danach bestimmt das
  // Seitenverhaeltnis des Covers die Hoehe, damit nichts beschnitten wird.
  const frameStyle = { aspectRatio: `${ratio ?? 3 / 4}` };

  if (source === null || failed) {
    return (
      <div
        className="flex w-full items-center justify-center bg-base-200 text-sm font-semibold opacity-60"
        style={frameStyle}
      >
        {number}
      </div>
    );
  }

  return (
    <div className="w-full" style={frameStyle}>
      <img
        src={source}
        alt={
          entry?.title !== null && entry?.title !== undefined
            ? `${entry.title} (Nr. ${number})`
            : `Nr. ${number}`
        }
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
        onLoad={(event) => {
          const image = event.currentTarget;

          if (image.naturalWidth > 0 && image.naturalHeight > 0) {
            setRatio(image.naturalWidth / image.naturalHeight);
          }
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
