#!/usr/bin/env node
/**
 * Synchronisiert Cover-URLs und Bandtitel aus Duckipedia nach src/data/catalog.json.
 *
 * Cover werden ausschließlich verlinkt (Duckipedia-Thumbnails bzw. offizielle
 * Cover-URLs), nie heruntergeladen. Bei Fehlern wird die Datei nicht geschrieben.
 */
import { previousCatalogIsbns, previousCatalogStats } from "./sync-catalog/catalog.mjs";
import {
  API_URL,
  COVER_PAGE,
  DUCKIPEDIA_SERIES,
  EGMONT_SERIES,
  ISBN_ENRICHMENT_ENABLED,
  ISSUE_PAGE,
  OFFICIAL_COVER_BASE,
  OUTPUT_FILE,
  SERIES_BASE,
  SONDEREDITIONEN,
  SPECIAL_SERIES,
} from "./sync-catalog/constants.mjs";
import {
  crawlDuckipediaSeries,
  crawlEgmontSeries,
} from "./sync-catalog/duckipedia.mjs";
import { apiUrl, errorMessage, fetchJson } from "./sync-catalog/http.mjs";
import { collectEgmontIsbns } from "./sync-catalog/isbn.mjs";
import {
  crawlSeries,
  crawlSondereditionen,
  resolveCoverUrls,
  resolveOfficialCoverUrls,
} from "./sync-catalog/series.mjs";
import { parseCoverFiles, parsePageWikitext, parseTitles } from "./sync-catalog/wiki.mjs";
import { writeCatalog } from "./sync-catalog/write.mjs";

async function main() {
  const [coverData, issueData] = await Promise.all([
    fetchJson(
      apiUrl({
        action: "parse",
        page: COVER_PAGE,
        prop: "wikitext",
        format: "json",
      }),
      "Covergalerie",
    ),
    fetchJson(
      apiUrl({
        action: "parse",
        page: ISSUE_PAGE,
        prop: "wikitext",
        format: "json",
      }),
      "Ausgabenliste",
    ),
  ]);

  const coverFiles = parseCoverFiles(
    parsePageWikitext(coverData, "Covergalerie"),
  );
  const titles = parseTitles(parsePageWikitext(issueData, "Ausgabenliste"));
  const coverUrls = await resolveCoverUrls(coverFiles);

  const numbers = [
    ...new Set([...coverFiles.keys(), ...titles.keys()]),
  ].sort((a, b) => a - b);

  const officialCoverUrls = await resolveOfficialCoverUrls(numbers);

  // ISBNs sind optional und werden nie geraten. Ohne aktiven Hook bleiben
  // bereits geprüfte Werte aus dem vorhandenen Katalog erhalten.
  const isbns = ISBN_ENRICHMENT_ENABLED
    ? await collectEgmontIsbns(numbers)
    : await previousCatalogIsbns();

  const entries = numbers.map((number) => ({
    number,
    title: titles.get(number) ?? null,
    coverUrl: coverUrls.get(number) ?? null,
    coverUrlOfficial: officialCoverUrls.get(number) ?? null,
    isbn: isbns.get(number) ?? null,
  }));

  const series = {};

  for (const definition of SPECIAL_SERIES) {
    const seriesEntries = await crawlSeries(definition);

    if (seriesEntries.length === 0) {
      throw new Error(
        `${definition.name}: keine Bände gefunden. Es wurde nichts geschrieben.`,
      );
    }

    series[definition.name] = seriesEntries;
  }

  for (const definition of SONDEREDITIONEN) {
    const seriesEntries = await crawlSondereditionen(definition);

    if (seriesEntries.length === 0) {
      throw new Error(
        `${definition.name}: keine Baende in den Sondereditionen gefunden. Es wurde nichts geschrieben.`,
      );
    }

    series[definition.name] = seriesEntries;
  }

  for (const definition of EGMONT_SERIES) {
    const seriesEntries = await crawlEgmontSeries(definition);

    if (seriesEntries.length === 0) {
      throw new Error(
        `${definition.name}: keine Baende im Egmont-Shop gefunden. Es wurde nichts geschrieben.`,
      );
    }

    series[definition.name] = seriesEntries;
  }

  for (const definition of DUCKIPEDIA_SERIES) {
    const seriesEntries = await crawlDuckipediaSeries(definition);

    if (seriesEntries.length === 0) {
      throw new Error(
        `${definition.name}: keine Cover auf Duckipedia gefunden. Es wurde nichts geschrieben.`,
      );
    }

    series[definition.name] = seriesEntries;
  }

  const catalog = {
    meta: {
      sources: [
        `https://de.duckipedia.org/wiki/${COVER_PAGE}`,
        `https://de.duckipedia.org/wiki/${ISSUE_PAGE}`,
        API_URL,
        `${OFFICIAL_COVER_BASE}/LTB-<nummer>.jpg (geprüfte Fallback-Muster)`,
        `${SERIES_BASE}/<slug>`,
        "https://www.egmont-shop.de/<slug>-nr-<nr>/",
        "https://de.duckipedia.org/wiki/DD_<nummer>",
        "https://de.duckipedia.org/wiki/Panzerknacker_%26_Co_<nummer>",
        ...(ISBN_ENRICHMENT_ENABLED
          ? [
              "https://www.egmont-shop.de/lustiges-taschenbuch-nr-<nummer>-<slug>/ (ISBN, opt-in)",
            ]
          : []),
      ],
      syncedAt: new Date().toISOString(),
    },
    entries,
    series,
  };

  const withTitle = entries.filter((entry) => entry.title !== null).length;
  const withCover = entries.filter((entry) => entry.coverUrl !== null).length;
  const withOfficial = entries.filter(
    (entry) => entry.coverUrlOfficial !== null,
  ).length;
  const withIsbn = entries.filter((entry) => entry.isbn !== null).length;
  const withoutAnyCover = entries.filter(
    (entry) => entry.coverUrl === null && entry.coverUrlOfficial === null,
  ).length;
  const previous = await previousCatalogStats();

  if (
    previous !== null &&
    (entries.length < previous.entries * 0.9 ||
      withTitle < previous.titles * 0.9 ||
      withCover < previous.covers * 0.9)
  ) {
    throw new Error(
      "Der neue Katalog hat deutlich weniger Einträge, Titel oder Cover als " +
        "der vorhandene. Es wurde nichts geschrieben.",
    );
  }

  // Nebenreihen getrennt prüfen: eine geänderte Pagination liefert sonst
  // stillschweigend nur die erste Seite und der Lauf gilt als erfolgreich.
  const shrunkenSeries = Object.entries(previous?.series ?? {}).filter(
    ([name, count]) =>
      count > 0 &&
      (series[name] === undefined || series[name].length < count * 0.9),
  );

  if (shrunkenSeries.length > 0) {
    throw new Error(
      `Diese Nebenreihen hätten deutlich weniger Bände als vorher: ` +
        `${shrunkenSeries.map(([name, count]) => `${name} (${count})`).join(", ")}. ` +
        "Es wurde nichts geschrieben.",
    );
  }

  await writeCatalog(OUTPUT_FILE, catalog);

  const seriesCount = Object.values(series).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  console.info(
    `catalog.json geschrieben: ${entries.length} Einträge, ` +
      `${withTitle} Titel, ${withCover} Duckipedia-Cover, ` +
      `${withOfficial} mit geprüfter offizieller Fallback-URL, ` +
      `${withoutAnyCover} ohne Cover, ${withIsbn} ISBN ` +
      (ISBN_ENRICHMENT_ENABLED
        ? "(Anreicherung aktiv). "
        : "(Anreicherung aus; LTB_CATALOG_ISBN=1 aktiviert sie). ") +
      `${Object.keys(series).length} Nebenreihen (${seriesCount} Bände).`,
  );
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
