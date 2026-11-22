import { useEffect, useState } from "react";
import { loadCatalog as loadMessages, type Locale } from "../i18n";
import type { AddItem } from "./add";
import { loadCatalogData, type Catalog, type Collection } from "./collection";
import {
  HttpError,
  isWritableRepository,
  loadInitialData,
  type CollectionRepository,
  type SeriesResult,
} from "./repository";
import {
  buildViewPath,
  parseViewState,
  type ViewState,
} from "./url-state";

export type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      collection: Collection;
      catalog: Catalog;
      repository: CollectionRepository;
    }
  | { status: "error"; message: string };

export function useAppState(
  initialLocale: Locale,
  fixedRepository?: CollectionRepository,
) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [switchingLocale, setSwitchingLocale] = useState(false);
  const [view, setView] = useState<ViewState>(() =>
    parseViewState(window.location.pathname, window.location.search),
  );
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  function updateView(patch: Partial<ViewState>, mode: "push" | "replace") {
    const next: ViewState = { ...view, ...patch };

    if (patch.tab !== undefined && next.tab !== "specials") {
      next.series = null;
    }

    setView(next);
    window.history[mode === "push" ? "pushState" : "replaceState"](
      null,
      "",
      buildViewPath(next),
    );
  }

  useEffect(() => {
    // Die Wurzel und unbekannte Pfade werden beim Laden auf den kanonischen
    // Pfad des Default-Tabs korrigiert; die Auswahl in der Query bleibt erhalten.
    const current = `${window.location.pathname}${window.location.search}`;
    const canonical = buildViewPath(
      parseViewState(window.location.pathname, window.location.search),
    );

    if (current !== canonical) {
      window.history.replaceState(null, "", canonical);
    }
  }, []);

  useEffect(() => {
    function handlePopState() {
      setView(parseViewState(window.location.pathname, window.location.search));
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const catalog = await loadCatalogData();

      if (fixedRepository !== undefined) {
        return {
          repository: fixedRepository,
          collection: await fixedRepository.load(),
          catalog,
        };
      }

      const initial = await loadInitialData();

      return { ...initial, catalog };
    }

    load()
      .then(({ repository, collection, catalog }) => {
        if (!cancelled) {
          setLoadState({ status: "ready", collection, catalog, repository });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        // Ohne gültige Session führt die App zur Anmeldung, statt einen
        // nicht behebbaren Ladefehler zu zeigen.
        if (error instanceof HttpError && error.status === 401) {
          window.location.replace("/login.html");
          return;
        }

        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fixedRepository]);

  async function handleAddVolumes(items: readonly AddItem[]) {
    if (loadState.status !== "ready") {
      throw new Error("Daten sind noch nicht geladen.");
    }

    const { repository } = loadState;

    if (!isWritableRepository(repository)) {
      throw new Error("Schreiben ist ohne API nicht möglich.");
    }

    await repository.addLtbRows(items);
    const collection = await repository.load();

    setLoadState((current) =>
      current.status === "ready" ? { ...current, collection } : current,
    );
  }

  async function handleAddSeries(
    series: string,
    numbers: readonly number[],
  ): Promise<SeriesResult> {
    if (loadState.status !== "ready") {
      throw new Error("Daten sind noch nicht geladen.");
    }

    const { repository } = loadState;

    if (!isWritableRepository(repository)) {
      throw new Error("Schreiben ist ohne API nicht möglich.");
    }

    const result = await repository.addSeries(series, numbers);
    const collection = await repository.load();

    setLoadState((current) =>
      current.status === "ready" ? { ...current, collection } : current,
    );

    return result;
  }

  async function handleRememberIsbn(isbn: string, number: number) {
    if (loadState.status !== "ready") {
      throw new Error("Daten sind noch nicht geladen.");
    }

    const { repository } = loadState;

    if (!isWritableRepository(repository)) {
      throw new Error("Schreiben ist ohne API nicht möglich.");
    }

    await repository.rememberIsbn(isbn, number);
    const collection = await repository.load();

    setLoadState((current) =>
      current.status === "ready" ? { ...current, collection } : current,
    );
  }

  async function handleLogout() {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      // ?switch=1 verhindert, dass die Login-Seite wegen einer noch
      // gueltigen Session sofort wieder zurueckleitet. So ist ein
      // Benutzerwechsel auch dann moeglich, wenn der Logout-Request
      // fehlschlaegt.
      window.location.replace("/login.html?switch=1");
    }
  }

  async function handleLocaleChange(nextLocale: Locale) {
    if (nextLocale === locale) {
      return;
    }

    setSwitchingLocale(true);

    try {
      await loadMessages(nextLocale);
      setLocale(nextLocale);
    } catch (error) {
      console.error("Der Sprachkatalog konnte nicht geladen werden.", error);
    } finally {
      setSwitchingLocale(false);
    }
  }

  return {
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
  };
}
