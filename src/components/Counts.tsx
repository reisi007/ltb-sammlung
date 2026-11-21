import { Trans } from "@lingui/react/macro";

export function VolumeCount({ count }: { count: number }) {
  return count === 1 ? (
    <Trans>{count} Band</Trans>
  ) : (
    <Trans>{count} Bände</Trans>
  );
}

export function NumberCount({ count }: { count: number }) {
  return count === 1 ? (
    <Trans>{count} Nummer</Trans>
  ) : (
    <Trans>{count} Nummern</Trans>
  );
}

export function RowCount({ count }: { count: number }) {
  return count === 1 ? (
    <Trans>{count} Zeile</Trans>
  ) : (
    <Trans>{count} Zeilen</Trans>
  );
}

export function MatchCount({ count }: { count: number }) {
  return <Trans>{count} Treffer</Trans>;
}
