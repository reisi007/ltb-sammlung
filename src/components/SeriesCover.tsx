import { useState } from "react";
import type { SeriesCatalogEntry } from "../lib/collection";

interface SeriesCoverProps {
  number: number;
  entry: SeriesCatalogEntry | null;
}

export function SeriesCover({ number, entry }: SeriesCoverProps) {
  const [failed, setFailed] = useState(false);
  const source = entry?.coverUrl ?? null;

  if (source === null || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-base-200 text-sm font-semibold opacity-60">
        {number}
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={
        entry?.title !== null && entry?.title !== undefined
          ? `${entry.title} (Nr. ${number})`
          : `Nr. ${number}`
      }
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
