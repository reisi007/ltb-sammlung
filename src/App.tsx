import { Trans } from "@lingui/react/macro";
import { AppFooter } from "./components/AppFooter";
import { AppHeader } from "./components/AppHeader";
import { CollectionView } from "./components/CollectionView";
import type { Locale } from "./i18n";
import { useAppState } from "./lib/appState";
import type { CollectionRepository } from "./lib/repository";

interface AppProps {
  initialLocale: Locale;
  repository?: CollectionRepository;
}

export default function App({
  initialLocale,
  repository: fixedRepository,
}: AppProps) {
  const {
    locale,
    switchingLocale,
    view,
    loadState,
    updateView,
    handleAddVolumes,
    handleAddSeries,
    handleRememberIsbn,
    handleLogout,
    handleLocaleChange,
  } = useAppState(initialLocale, fixedRepository);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        locale={locale}
        switching={switchingLocale}
        onLocaleChange={handleLocaleChange}
        onLogout={
          loadState.status === "ready" &&
          loadState.repository.capabilities.write
            ? () => {
                handleLogout().catch(() => {
                  // Der finally-Zweig leitet in jedem Fall zur Anmeldung.
                });
              }
            : undefined
        }
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6">
        {loadState.status === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
            <span className="loading loading-spinner loading-lg" aria-hidden="true" />
            <p className="text-sm opacity-70">
              <Trans>Daten werden geladen…</Trans>
            </p>
          </div>
        )}

        {loadState.status === "error" && (
          <div role="alert" className="alert alert-error">
            <div>
              <h2 className="font-semibold">
                <Trans>Daten konnten nicht geladen werden.</Trans>
              </h2>
              <p className="text-sm">{loadState.message}</p>
            </div>
          </div>
        )}

        {loadState.status === "ready" && (
          <CollectionView
            collection={loadState.collection}
            catalog={loadState.catalog}
            locale={locale}
            query={view.query}
            activeTab={view.tab}
            showMissing={view.showMissing}
            series={view.series}
            canWrite={loadState.repository.capabilities.write}
            onQueryChange={(query) => updateView({ query }, "replace")}
            onTabChange={(tab) => updateView({ tab }, "push")}
            onShowMissingChange={(showMissing) =>
              updateView({ showMissing }, "replace")
            }
            onSeriesSelect={(series) => updateView({ series }, "push")}
            onSelectNumber={(number) =>
              updateView({ query: String(number), tab: "ltb" }, "push")
            }
            onAddVolumes={handleAddVolumes}
            onAddSeries={handleAddSeries}
            onRememberIsbn={handleRememberIsbn}
          />
        )}
      </main>

      {loadState.status === "ready" && (
        <AppFooter
          collection={loadState.collection}
          catalog={loadState.catalog}
          locale={locale}
        />
      )}
    </div>
  );
}
