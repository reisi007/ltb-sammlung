import { Trans, useLingui } from "@lingui/react/macro";

interface IsbnPromptProps {
  isbn: string;
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onAssign: () => void;
}

export function IsbnPrompt({
  isbn,
  value,
  saving,
  onChange,
  onAssign,
}: IsbnPromptProps) {
  const { t } = useLingui();

  return (
    <div className="alert alert-info mb-4 flex-col items-start gap-2">
      <span>
        <Trans>
          ISBN {isbn} ist noch nicht zugeordnet. Welche LTB-Nummer ist das?
        </Trans>
      </span>
      <div className="flex w-full items-end gap-2">
        <input
          type="text"
          inputMode="numeric"
          className="input input-sm w-full"
          placeholder={t`z. B. 219`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={saving || value.trim() === ""}
          onClick={onAssign}
        >
          {saving && (
            <span
              className="loading loading-spinner loading-xs"
              aria-hidden="true"
            />
          )}
          <Trans>Zuordnen</Trans>
        </button>
      </div>
      <p className="text-xs opacity-70">
        <Trans>
          Die Zuordnung wird gespeichert und beim nächsten Scan
          wiederverwendet.
        </Trans>
      </p>
    </div>
  );
}
