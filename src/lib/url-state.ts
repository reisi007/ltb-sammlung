/**
 * Ansichtszustand in der URL. Die Funktionen sind rein und fassen bewusst kein
 * `window` auf Modulebene an, damit sie auch in Vitest/Node laufen.
 */

export type TabId = "ltb" | "specials" | "donaldDuck" | "panzerknacker";

export interface ViewState {
  tab: TabId;
  query: string;
  showMissing: boolean;
  series: string | null;
}

const DEFAULT_TAB: TabId = "ltb";

const PATH_BY_TAB: Record<TabId, string> = {
  ltb: "ltb",
  specials: "specials",
  donaldDuck: "donald-duck",
  panzerknacker: "panzerknacker",
};

const TAB_BY_PATH: Record<string, TabId> = {
  ltb: "ltb",
  specials: "specials",
  "donald-duck": "donaldDuck",
  panzerknacker: "panzerknacker",
};

/** Entfernt einen abschließenden Schrägstrich aus dem Basispfad. */
function withoutTrailingSlash(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return trimmed === "" ? "" : trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function tabFromPath(pathname: string, base: string): TabId {
  const prefix = withoutTrailingSlash(base);
  let relative: string;

  if (prefix === "") {
    relative = pathname;
  } else if (pathname === prefix) {
    relative = "";
  } else if (pathname.startsWith(`${prefix}/`)) {
    relative = pathname.slice(prefix.length + 1);
  } else {
    return DEFAULT_TAB;
  }

  const segment = relative.split("/").find((part) => part !== "");

  return segment === undefined ? DEFAULT_TAB : (TAB_BY_PATH[segment] ?? DEFAULT_TAB);
}

export function parseViewState(
  pathname: string,
  search: string,
  base: string = import.meta.env.BASE_URL ?? "/",
): ViewState {
  const tab = tabFromPath(pathname, base);
  const params = new URLSearchParams(search);
  const rawSeries = params.get("series");

  return {
    tab,
    query: params.get("q") ?? "",
    showMissing: params.get("missing") === "1",
    series: tab === "specials" && rawSeries !== null && rawSeries !== "" ? rawSeries : null,
  };
}

export function buildViewPath(
  state: ViewState,
  base: string = import.meta.env.BASE_URL ?? "/",
): string {
  const prefix = withoutTrailingSlash(base);
  const path = `${prefix}/${PATH_BY_TAB[state.tab] ?? PATH_BY_TAB[DEFAULT_TAB]}`;
  const params = new URLSearchParams();

  if (state.query !== "") {
    params.set("q", state.query);
  }
  if (state.tab === "specials" && state.series !== null && state.series !== "") {
    params.set("series", state.series);
  }
  if (state.showMissing) {
    params.set("missing", "1");
  }

  const search = params.toString();

  return search === "" ? path : `${path}?${search}`;
}
