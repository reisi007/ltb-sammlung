import { Trans, useLingui } from "@lingui/react/macro";
import { isLocale, type Locale } from "../i18n";

interface AppHeaderProps {
  locale: Locale;
  switching: boolean;
  onLocaleChange: (locale: Locale) => void;
  onLogout?: () => void;
}

export function AppHeader({
  locale,
  switching,
  onLocaleChange,
  onLogout,
}: AppHeaderProps) {
  const { t } = useLingui();

  return (
    <header className="bg-base-200">
      <div className="navbar mx-auto w-full max-w-7xl gap-2 px-4">
        <div className="navbar-start">
          <div>
            <p className="text-lg font-bold leading-tight">
              <Trans>LTB-Sammlung</Trans>
            </p>
            <p className="hidden text-xs opacity-70 sm:block">
              <Trans>Meine Lustiges-Taschenbuch-Sammlung</Trans>
            </p>
          </div>
        </div>
        <div className="navbar-end gap-2">
          <label className="flex items-center gap-2">
            <span className="hidden text-sm sm:inline">
              <Trans>Sprache</Trans>
            </span>
            <select
              className="select select-sm"
              value={locale}
              disabled={switching}
              aria-label={t`Sprache`}
              onChange={(event) => {
                const nextLocale = event.target.value;

                if (isLocale(nextLocale)) {
                  onLocaleChange(nextLocale);
                }
              }}
            >
              <option value="de">{t`Deutsch`}</option>
              <option value="en">{t`Englisch`}</option>
            </select>
          </label>
          {switching && (
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
          )}
          {onLogout !== undefined && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onLogout}
            >
              <Trans>Abmelden</Trans>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
