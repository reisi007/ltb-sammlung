#!/usr/bin/env node
/**
 * Synchronisiert Cover-URLs und Bandtitel aus Duckipedia nach src/data/catalog.json.
 *
 * Cover werden ausschließlich verlinkt (Duckipedia-Thumbnails bzw. offizielle
 * Cover-URLs), nie heruntergeladen. Bei Fehlern wird die Datei nicht geschrieben.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://de.duckipedia.org/api.php";
const COVER_PAGE = "Covergalerie_Lustiges_Taschenbuch";
const ISSUE_PAGE = "Ausgabenliste_Lustiges_Taschenbuch";
const OFFICIAL_COVER_BASE =
  "https://www.lustiges-taschenbuch.de/sites/default/files/cover";
const OUTPUT_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/catalog.json",
);
const USER_AGENT =
  "ltb-sammlung/0.1 (+https://github.com/reisi007/ltb-sammlung)";
const REQUEST_TIMEOUT_MS = 45_000;
const BATCH_SIZE = 50;
const BATCH_PAUSE_MS = 150;
const MAX_RETRIES = 2;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function apiUrl(parameters) {
  const url = new URL(API_URL);

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

async function fetchJson(url, label) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: "application/json",
          "user-agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES) {
        const waitMs = 750 * 2 ** attempt;
        console.info(
          `${label}: Versuch ${attempt + 1} fehlgeschlagen (${errorMessage(error)}), ` +
            `neuer Versuch in ${waitMs} ms.`,
        );
        await sleep(waitMs);
      }
    }
  }

  throw new Error(`${label}: Abruf fehlgeschlagen (${errorMessage(lastError)}).`);
}

function parsePageWikitext(data, label) {
  const wikitext = data?.parse?.wikitext?.["*"];

  if (typeof wikitext !== "string" || wikitext.trim() === "") {
    throw new Error(`${label}: Unerwartete API-Antwort ohne Wikitext.`);
  }

  return wikitext;
}

function normalizeTitle(value) {
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function parseCoverFiles(wikitext) {
  const gallery = /<gallery[^>]*>([\s\S]*?)<\/gallery>/i.exec(wikitext);

  if (!gallery) {
    throw new Error(
      "Covergalerie: Es wurde kein <gallery>-Block gefunden. " +
        "Hat sich der Seitenaufbau geändert?",
    );
  }

  const files = new Map();

  for (const rawLine of gallery[1].split(/\r?\n/)) {
    const link = /link=LTB\s+(\d+)/i.exec(rawLine);

    if (!link) {
      continue;
    }

    const fileName = rawLine
      .split("|")[0]
      .trim()
      .replace(/^(?:Datei|File|Image):/i, "");
    const number = Number.parseInt(link[1], 10);

    if (fileName === "" || !Number.isSafeInteger(number)) {
      continue;
    }

    // Nur das erste Vorkommen zählt; spätere Galerien zeigen Neuauflagen.
    if (!files.has(number)) {
      files.set(number, fileName);
    }
  }

  if (files.size === 0) {
    throw new Error(
      "Covergalerie: Im ersten <gallery>-Block wurden keine LTB-Cover gefunden.",
    );
  }

  return files;
}

function cleanWikiText(value) {
  let result = value
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<[^>]+>/g, "");

  let previous = "";

  while (previous !== result) {
    previous = result;
    result = result.replace(/\{\{[^{}]*\}\}/g, "");
  }

  return result
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:–—-]+/, "")
    .replace(/[\s,;:–—-]+$/, "")
    .trim();
}

function parseTitles(wikitext) {
  const titles = new Map();
  const pattern = /\[\[LTB\s+(\d+)[^\]]*\]\]\s*\|\s*([^|\n]+)/g;
  let match = pattern.exec(wikitext);

  while (match !== null) {
    const number = Number.parseInt(match[1], 10);
    const title = cleanWikiText(match[2]);

    if (title !== "" && !titles.has(number)) {
      titles.set(number, title);
    }

    match = pattern.exec(wikitext);
  }

  if (titles.size === 0) {
    throw new Error(
      "Ausgabenliste: Es wurden keine Bandtitel gefunden. " +
        "Hat sich der Tabellenaufbau geändert?",
    );
  }

  return titles;
}

function resolveRequestedTitle(requestedTitle, data) {
  let title = normalizeTitle(requestedTitle);
  const normalized = data?.query?.normalized;
  const redirects = data?.query?.redirects;

  if (Array.isArray(normalized)) {
    for (const item of normalized) {
      if (
        item &&
        typeof item.from === "string" &&
        typeof item.to === "string" &&
        normalizeTitle(item.from) === title
      ) {
        title = normalizeTitle(item.to);
        break;
      }
    }
  }

  if (Array.isArray(redirects)) {
    for (const item of redirects) {
      if (
        item &&
        typeof item.from === "string" &&
        typeof item.to === "string" &&
        normalizeTitle(item.from) === title
      ) {
        title = normalizeTitle(item.to);
        break;
      }
    }
  }

  return title;
}

async function resolveCoverUrls(files) {
  const numbers = [...files.keys()].sort((a, b) => a - b);
  const coverUrls = new Map();

  for (let offset = 0; offset < numbers.length; offset += BATCH_SIZE) {
    const batch = numbers.slice(offset, offset + BATCH_SIZE);
    const titles = batch
      .map((number) => `File:${files.get(number)}`)
      .join("|");
    const label = `Cover-Batch ${Math.floor(offset / BATCH_SIZE) + 1}`;
    const data = await fetchJson(
      apiUrl({
        action: "query",
        titles,
        prop: "imageinfo",
        iiprop: "url",
        iiurlwidth: "240",
        format: "json",
        redirects: "1",
      }),
      label,
    );
    const pages = data?.query?.pages;

    if (!pages || typeof pages !== "object") {
      throw new Error(`${label}: Unerwartete API-Antwort ohne query.pages.`);
    }

    const urlsByTitle = new Map();

    for (const page of Object.values(pages)) {
      if (!page || typeof page !== "object") {
        continue;
      }

      const imageInfo = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
      const url =
        imageInfo && typeof imageInfo === "object"
          ? (imageInfo.thumburl ?? imageInfo.url)
          : null;

      if (typeof page.title === "string" && typeof url === "string") {
        urlsByTitle.set(normalizeTitle(page.title), url);
      }
    }

    for (const number of batch) {
      const requested = `File:${files.get(number)}`;
      const resolved = resolveRequestedTitle(requested, data);
      const url = urlsByTitle.get(resolved);

      if (typeof url === "string") {
        coverUrls.set(number, url);
      }
    }

    if (offset + BATCH_SIZE < numbers.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  if (coverUrls.size === 0) {
    throw new Error(
      "Duckipedia lieferte keine einzige Cover-URL. Es wurde nichts geschrieben.",
    );
  }

  return coverUrls;
}

function officialCoverUrl(number) {
  return `${OFFICIAL_COVER_BASE}/LTB-${number}.jpg`;
}

async function previousCatalogStats() {
  try {
    const previous = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));

    if (!Array.isArray(previous.entries)) {
      return null;
    }

    return {
      entries: previous.entries.length,
      titles: previous.entries.filter((entry) => entry.title !== null).length,
      covers: previous.entries.filter((entry) => entry.coverUrl !== null).length,
    };
  } catch {
    return null;
  }
}

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

  const entries = numbers.map((number) => ({
    number,
    title: titles.get(number) ?? null,
    coverUrl: coverUrls.get(number) ?? null,
    coverUrlOfficial: officialCoverUrl(number),
  }));

  const catalog = {
    meta: {
      sources: [
        `https://de.duckipedia.org/wiki/${COVER_PAGE}`,
        `https://de.duckipedia.org/wiki/${ISSUE_PAGE}`,
        API_URL,
        `${OFFICIAL_COVER_BASE}/LTB-<nummer>.jpg`,
      ],
      syncedAt: new Date().toISOString(),
    },
    entries,
  };

  const withTitle = entries.filter((entry) => entry.title !== null).length;
  const withCover = entries.filter((entry) => entry.coverUrl !== null).length;
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

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  console.info(
    `catalog.json geschrieben: ${entries.length} Einträge, ` +
      `${withTitle} Titel, ${withCover} Duckipedia-Cover, ` +
      `${numbers.length - withCover} Einträge nur mit offizieller Cover-URL.`,
  );
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
