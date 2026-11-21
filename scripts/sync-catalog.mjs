#!/usr/bin/env node
/**
 * Synchronisiert Cover-URLs und Bandtitel aus Duckipedia nach src/data/catalog.json.
 *
 * Cover werden ausschließlich verlinkt (Duckipedia-Thumbnails bzw. offizielle
 * Cover-URLs), nie heruntergeladen. Bei Fehlern wird die Datei nicht geschrieben.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://de.duckipedia.org/api.php";
const COVER_PAGE = "Covergalerie_Lustiges_Taschenbuch";
const ISSUE_PAGE = "Ausgabenliste_Lustiges_Taschenbuch";
const OFFICIAL_COVER_BASE =
  "https://www.lustiges-taschenbuch.de/sites/default/files/cover";
const OFFICIAL_SITE_BASE = "https://www.lustiges-taschenbuch.de";
const SERIES_BASE = `${OFFICIAL_SITE_BASE}/ausgaben/nebenreihen`;

/**
 * Sheet-Name -> Slug der offiziellen Nebenreihen-Seite. Reihen ohne sichere
 * Entsprechung (z. B. „Entenhausens Unterwelt") bleiben bewusst weg und
 * bekommen kein Cover.
 */
const SPECIAL_SERIES = [
  { name: "LTB Spezial", slug: "spezial" },
  { name: "LTB Enten-Edition", slug: "enten-edition" },
  { name: "LTB Premium", slug: "premium" },
  { name: "LTB Premium +", slug: "ltb-premium-plus" },
  { name: "LTB Ultimate Phantomias", slug: "ultimate-phantomias" },
  { name: "LTB Young Comics", slug: "ltb-young-comics" },
  { name: "LTB Halloween", slug: "halloween" },
  { name: "LTB History", slug: "history" },
  { name: "LTB Phantomias Collection", slug: "LTB-Phantomias-Collection" },
];

/**
 * Reihen, die nur im Egmont-Shop erscheinen (nicht in der offiziellen
 * Nebenreihen-Übersicht). Cover werden ausschließlich verlinkt.
 */
const EGMONT_SERIES = [
  {
    name: "Micky Maus Legacy Collection",
    slug: "micky-maus-legacy-collection",
    maxIssues: 12,
  },
];

/**
 * Sondereditionen sind nach Jahren und Bänden gegliedert (z. B.
 * "2016-band-1-entenhausens-unterwelt-…"). Die Übersicht ist paginiert.
 */
const SONDEREDITIONEN = [
  {
    name: "Entenhausens Unterwelt",
    year: 2016,
    slug: "entenhausens-unterwelt",
  },
];

/**
 * Duckipedia-Artikel der Form "DD 201" bzw. "Panzerknacker & Co 10" enthalten
 * das Cover im Infobox-Feld `BILD`.
 */
const DUCKIPEDIA_SERIES = [
  { name: "Donald Duck", pagePrefix: "DD " },
  { name: "Panzerknacker & Co", pagePrefix: "Panzerknacker & Co " },
];

/**
 * Frühere Namen aus der Sammlung -> offizielle Schreibweise. Wird für den
 * Vergleich mit dem vorhandenen Katalog genutzt, damit eine reine Umbenennung
 * nicht als geschrumpfte Reihe gilt.
 */
const SERIES_ALIASES = {
  "enten edition": "LTB Enten-Edition",
  "ltb-premium": "LTB Premium",
  "premium+": "LTB Premium +",
  "ultimativer phantomias": "LTB Ultimate Phantomias",
  "ultimate phantomias": "LTB Ultimate Phantomias",
  young: "LTB Young Comics",
  "young comics": "LTB Young Comics",
  halloween: "LTB Halloween",
  "ltb-history": "LTB History",
  "phantomias collection": "LTB Phantomias Collection",
  "ltb sonderedition – entenhausens unterwelt": "Entenhausens Unterwelt",
  "ltb sonderedition - entenhausens unterwelt": "Entenhausens Unterwelt",
  "sonderedition – entenhausens unterwelt": "Entenhausens Unterwelt",
  "sonderedition - entenhausens unterwelt": "Entenhausens Unterwelt",
  "sonderedition entenhausens unterwelt": "Entenhausens Unterwelt",
};
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

/**
 * Optionale ISBN-Anreicherung aus dem Egmont-Shop.
 *
 * Stand 2026-11 liefern die Produktseiten der LTB-Hauptreihe
 * (`/lustiges-taschenbuch-nr-<nr>-<slug>/`) weder `ISBN` in den Produktdaten
 * noch `gtin13` im JSON-LD; nur Nebenreihen tragen dort eine ISBN. Der Hook
 * ist deshalb standardmäßig aus. Eingeschaltet (`LTB_CATALOG_ISBN=1`) wird
 * ausschließlich eine ISBN mit gültiger Prüfziffer übernommen, deren
 * Produktname exakt `Lustiges Taschenbuch Nr. <nr>` nennt. Ohne Beleg bleibt
 * das Feld null — es wird nie eine Nummer aus einem ISBN-Muster geraten.
 */
const ISBN_ENRICHMENT_ENABLED = process.env.LTB_CATALOG_ISBN === "1";
const EGMONT_SITEMAP_URL = "https://www.egmont-shop.de/sitemap.xml";
const EGMONT_MAIN_SERIES_PATTERN =
  /<loc>(https:\/\/www\.egmont-shop\.de\/lustiges-taschenbuch-nr-(\d+)-[^<]+)<\/loc>/g;

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

function officialCoverCandidates(number) {
  const padded = String(number).padStart(3, "0");

  return [
    `${OFFICIAL_COVER_BASE}/LTB-${number}.jpg`,
    `${OFFICIAL_COVER_BASE}/ltb_Aktuell_${padded}.jpg`,
    `${OFFICIAL_COVER_BASE}/ltb_${number}.jpg`,
    `${OFFICIAL_COVER_BASE}/ltb_1.NA_${number}.jpg`,
    `${OFFICIAL_COVER_BASE}/ltb_EA_${number}.jpg`,
    `${OFFICIAL_COVER_BASE}/ltb_EA_${number}_0.jpg`,
  ];
}

async function urlExists(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": USER_AGENT },
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Probiert die bekannten Dateinamen-Schemata der offiziellen Seite durch und
 * gibt nur URLs zurück, die wirklich mit HTTP 2xx antworten. Die Muster
 * unterscheiden sich je nach Erscheinungszeitraum (LTB-123.jpg,
 * ltb_Aktuell_016.jpg, ltb_216.jpg).
 */
async function resolveOfficialCoverUrls(numbers) {
  const result = new Map();

  for (let offset = 0; offset < numbers.length; offset += BATCH_SIZE) {
    const batch = numbers.slice(offset, offset + BATCH_SIZE);

    await Promise.all(
      batch.map(async (number) => {
        for (const candidate of officialCoverCandidates(number)) {
          if (await urlExists(candidate)) {
            result.set(number, candidate);
            return;
          }
        }

        result.set(number, null);
      }),
    );

    if (offset + BATCH_SIZE < numbers.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  return result;
}

async function fetchHtml(url, label) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: "text/html",
          "user-agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return await response.text();
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

  throw new Error(`${label}: ${errorMessage(lastError)}`);
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function stripHtml(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Liest eine Nebenreihen-Seite (eine Paginierungsseite) aus. Die Struktur ist:
 * <a href="…/band-133"><img src="…" alt="LTB Spezial 133 - Titel" />
 * <p><span class="field--name-title">Titel</span></p></a>
 */
function parseSeriesPage(html, label) {
  const entries = new Map();
  const anchorPattern =
    /<a\s+href="([^"]*band-(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match = anchorPattern.exec(html);

  while (match !== null) {
    const [, , rawNumber, inner] = match;
    const image = /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/i.exec(inner);

    if (image !== null) {
      const number = Number.parseInt(rawNumber, 10);
      const source = image[1];
      const alt = decodeHtml(image[2]);
      const titleMatch =
        /<span[^>]*class="[^"]*field--name-title[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(
          inner,
        );
      const title =
        titleMatch !== null
          ? stripHtml(titleMatch[1])
          : alt.split(" - ").slice(1).join(" - ");

      if (!entries.has(number)) {
        entries.set(number, {
          number,
          title: title === "" ? null : title,
          coverUrl: source.startsWith("http")
            ? source
            : `${OFFICIAL_SITE_BASE}${source}`,
        });
      }
    }

    match = anchorPattern.exec(html);
  }

  if (entries.size === 0) {
    throw new Error(`${label}: keine Bände auf der Seite gefunden.`);
  }

  return [...entries.values()].sort((a, b) => a.number - b.number);
}

async function crawlSeries({ name, slug }) {
  const baseUrl = `${SERIES_BASE}/${slug}`;
  const entries = new Map();
  let page = 0;

  while (page < 30) {
    const url = page === 0 ? baseUrl : `${baseUrl}?page=${page}`;
    const label = `${name} (${url})`;
    const html = await fetchHtml(url, label);

    for (const entry of parseSeriesPage(html, label)) {
      if (!entries.has(entry.number)) {
        entries.set(entry.number, entry);
      }
    }

    if (!/rel="next"/i.test(html)) {
      break;
    }

    page += 1;
    await sleep(BATCH_PAUSE_MS);
  }

  return [...entries.values()].sort((a, b) => a.number - b.number);
}

/**
 * Sammelt alle Duckipedia-Seiten mit dem gegebenen Präfix (Numerierung am
 * Ende der Seite). `allpages` liefert maximal 500 Einträge pro Aufruf.
 */
async function listDuckipediaPages(prefix) {
  const pages = [];
  let continuation = null;
  let request = 0;

  do {
    const parameters = {
      action: "query",
      list: "allpages",
      apprefix: prefix,
      apnamespace: "0",
      aplimit: "500",
      format: "json",
    };

    if (continuation !== null) {
      parameters.apcontinue = continuation;
    }

    const data = await fetchJson(
      apiUrl(parameters),
      `Duckipedia-Seiten (${prefix}, Runde ${request + 1})`,
    );
    const batch = data?.query?.allpages;

    if (!Array.isArray(batch)) {
      throw new Error(`Duckipedia-Seiten (${prefix}): unerwartete API-Antwort.`);
    }

    for (const page of batch) {
      if (typeof page?.title === "string") {
        pages.push(page.title);
      }
    }

    continuation =
      typeof data?.continue?.apcontinue === "string"
        ? data.continue.apcontinue
        : null;
    request += 1;

    if (continuation !== null) {
      await sleep(BATCH_PAUSE_MS);
    }
  } while (continuation !== null && request < 20);

  return pages;
}

/** Liest das erste Cover (`|BILD=`) aus Infobox-Wikitext. */
function parseInfoboxCover(wikitext) {
  const match = /\|\s*BILD\s*=\s*(?:\[\[)?(?:Datei|File|Image):([^|\]\n]+)/i.exec(
    wikitext,
  );

  return match === null ? null : match[1].trim();
}

/** Holt die Cover-Dateinamen für numerierte Duckipedia-Artikel. */
async function fetchDuckipediaCovers(entries) {
  const files = new Map();
  const byTitle = new Map(
    entries.map((entry) => [normalizeTitle(entry.title), entry.number]),
  );

  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const batch = entries.slice(offset, offset + BATCH_SIZE);
    const label = `Duckipedia-Baende ${Math.floor(offset / BATCH_SIZE) + 1}`;
    const data = await fetchJson(
      apiUrl({
        action: "query",
        prop: "revisions",
        rvprop: "content",
        rvslots: "main",
        titles: batch.map((entry) => entry.title).join("|"),
        redirects: "1",
        format: "json",
      }),
      label,
    );
    const pages = data?.query?.pages;

    if (!pages || typeof pages !== "object") {
      throw new Error(`${label}: unerwartete API-Antwort ohne query.pages.`);
    }

    for (const page of Object.values(pages)) {
      if (typeof page?.title !== "string") {
        continue;
      }

      const number = byTitle.get(normalizeTitle(page.title));

      if (number === undefined) {
        continue;
      }

      const content = page.revisions?.[0]?.slots?.main?.["*"];
      const file = typeof content === "string" ? parseInfoboxCover(content) : null;

      if (file !== null) {
        files.set(number, file);
      }
    }

    if (offset + BATCH_SIZE < entries.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  return files;
}

async function crawlDuckipediaSeries({ name, pagePrefix }) {
  const pages = await listDuckipediaPages(pagePrefix);
  const pattern = new RegExp(
    `^${pagePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`,
  );
  const entries = [];

  for (const title of pages) {
    const match = pattern.exec(title);

    if (match === null) {
      continue;
    }

    const number = Number.parseInt(match[1], 10);

    if (Number.isSafeInteger(number)) {
      entries.push({ title, number });
    }
  }

  entries.sort((a, b) => a.number - b.number);

  if (entries.length === 0) {
    return [];
  }

  const files = await fetchDuckipediaCovers(entries);

  if (files.size === 0) {
    return [];
  }

  const coverUrls = await resolveCoverUrls(files);

  return entries.map(({ number }) => ({
    number,
    title: null,
    coverUrl: coverUrls.get(number) ?? null,
  }));
}

/** Liest die Produktdaten aus dem eingebetteten JSON einer Egmont-Seite. */
function parseEgmontProductState(html) {
  const match =
    /<script type="application\/json" data-state="product-details-product">\s*(\{[\s\S]*?\})\s*<\/script>/.exec(
      html,
    );

  if (match === null) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** Liest Produktname und Cover aus einer Egmont-Shop-Produktseite. */
function parseEgmontProduct(html) {
  const product = parseEgmontProductState(html);

  if (product === null) {
    return null;
  }

  const imageUrl =
    typeof product?.imageUrl === "string" ? product.imageUrl : null;
  const coverUrl =
    imageUrl === null ? null : new URL(imageUrl, "https://www.egmont-shop.de").toString();
  const title = typeof product?.name === "string" ? product.name : null;

  return { title, coverUrl };
}

/**
 * Normalisiert ISBN-10/ISBN-13 auf eine gültige ISBN-13. Bewusst eine kleine
 * eigene Kopie von `src/lib/isbn.ts`: dieses Script laeuft direkt unter Node
 * und kann die TypeScript-Datei nicht importieren. Alles andere ergibt null.
 */
function normalizeIsbnValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toUpperCase().replace(/[^0-9X]/g, "");

  if (/^\d{9}[\dX]$/.test(normalized)) {
    let sum = 0;

    for (let index = 0; index < 10; index += 1) {
      const digit = normalized[index] === "X" ? 10 : Number(normalized[index]);
      sum += digit * (10 - index);
    }

    if (sum % 11 !== 0) {
      return null;
    }

    const core = `978${normalized.slice(0, 9)}`;
    let check = 0;

    for (let index = 0; index < 12; index += 1) {
      check += Number(core[index]) * (index % 2 === 0 ? 1 : 3);
    }

    return `${core}${(10 - (check % 10)) % 10}`;
  }

  if (/^97[89]\d{10}$/.test(normalized)) {
    let sum = 0;

    for (let index = 0; index < 12; index += 1) {
      sum += Number(normalized[index]) * (index % 2 === 0 ? 1 : 3);
    }

    return Number(normalized[12]) === (10 - (sum % 10)) % 10
      ? normalized
      : null;
  }

  return null;
}

/**
 * Liest die ISBN einer Egmont-Produktseite. Der Produktname muss die Bandnummer
 * exakt nennen, sonst gilt die Seite als nicht zugeordnet.
 */
function parseEgmontIsbn(html, number) {
  const product = parseEgmontProductState(html);

  if (product === null || typeof product.name !== "string") {
    return null;
  }

  const expected = new RegExp(`^Lustiges Taschenbuch Nr\\. ${number}(?:\\D|$)`);

  if (!expected.test(product.name)) {
    return null;
  }

  const specs = Array.isArray(product.specs) ? product.specs : [];
  const isbnSpec = specs.find((spec) => spec?.key === "ISBN");
  const fromSpecs = normalizeIsbnValue(isbnSpec?.value);

  if (fromSpecs !== null) {
    return fromSpecs;
  }

  const jsonLd =
    /<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/i.exec(html);

  if (jsonLd === null) {
    return null;
  }

  try {
    const data = JSON.parse(jsonLd[1]);

    return normalizeIsbnValue(data?.gtin13);
  } catch {
    return null;
  }
}

/**
 * Sammelt ISBNs der Hauptreihe aus dem Egmont-Shop. Eine Nummer bekommt nur
 * dann eine ISBN, wenn alle gefundenen Produktseiten dieselbe gültige ISBN
 * nennen; mehrere verschiedene ISBNs werden übersprungen.
 */
async function collectEgmontIsbns(numbers) {
  const wanted = new Set(numbers);
  const sitemap = await fetchHtml(EGMONT_SITEMAP_URL, "Egmont-Sitemap");
  const urlsByNumber = new Map();
  EGMONT_MAIN_SERIES_PATTERN.lastIndex = 0;
  let match = EGMONT_MAIN_SERIES_PATTERN.exec(sitemap);

  while (match !== null) {
    const number = Number.parseInt(match[2], 10);

    if (wanted.has(number)) {
      const urls = urlsByNumber.get(number) ?? [];

      if (!urls.includes(match[1])) {
        urls.push(match[1]);
      }

      urlsByNumber.set(number, urls);
    }

    match = EGMONT_MAIN_SERIES_PATTERN.exec(sitemap);
  }

  if (urlsByNumber.size === 0) {
    throw new Error(
      "Egmont-Sitemap enthält keine Produktseiten der LTB-Hauptreihe. " +
        "Es wurde nichts geschrieben.",
    );
  }

  const isbns = new Map();
  let failed = 0;
  let checked = 0;

  for (const number of [...urlsByNumber.keys()].sort((a, b) => a - b)) {
    const found = new Set();

    for (const url of urlsByNumber.get(number)) {
      try {
        const html = await fetchHtml(url, `Egmont ISBN ${number}`);
        const isbn = parseEgmontIsbn(html, number);

        if (isbn !== null) {
          found.add(isbn);
        }
      } catch (error) {
        failed += 1;
        console.info(
          `Egmont ISBN ${number}: Seite nicht lesbar (${errorMessage(error)}).`,
        );
      }

      await sleep(BATCH_PAUSE_MS);
    }

    if (found.size === 1) {
      isbns.set(number, [...found][0]);
    } else if (found.size > 1) {
      console.info(
        `Egmont ISBN ${number}: mehrere ISBNs (${[...found].join(", ")}), ` +
          "wird übersprungen.",
      );
    }

    checked += 1;

    if (checked % 50 === 0) {
      console.info(
        `Egmont ISBN: ${checked} Nummern geprüft, ${isbns.size} ISBN gefunden.`,
      );
    }
  }

  if (failed > 0) {
    console.info(
      `${failed} Egmont-Produktseiten waren nicht lesbar; betroffene Nummern ` +
        "bleiben ohne ISBN.",
    );
  }

  if (isbns.size === 0) {
    console.info(
      "Egmont-Shop liefert keine ISBN für die Hauptreihe; es wird keine ISBN " +
        "gesetzt.",
    );
  }

  return isbns;
}

/**
 * Vorhandene, bereits geprüfte ISBNs aus dem letzten Katalog. Sie bleiben
 * erhalten, solange die Anreicherung ausgeschaltet ist.
 */
async function previousCatalogIsbns() {
  const isbns = new Map();

  try {
    const previous = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));

    for (const entry of Array.isArray(previous.entries) ? previous.entries : []) {
      const isbn = normalizeIsbnValue(entry?.isbn);

      if (isbn !== null && Number.isSafeInteger(entry.number)) {
        isbns.set(entry.number, isbn);
      }
    }
  } catch {
    return isbns;
  }

  return isbns;
}

/** Wie fetchHtml, aber 404 bedeutet "Reihe endet hier" statt Fehler. */
async function fetchHtmlOrNull(url, label) {
  try {
    return await fetchHtml(url, label);
  } catch (error) {
    if (error instanceof Error && error.message.includes("HTTP 404")) {
      return null;
    }

    throw error;
  }
}

async function crawlEgmontSeries({ name, slug, maxIssues }) {
  const entries = [];
  let misses = 0;

  for (let number = 1; number <= maxIssues && misses < 2; number += 1) {
    const issue = String(number).padStart(2, "0");
    const url = `https://www.egmont-shop.de/${slug}-nr-${issue}/`;
    const html = await fetchHtmlOrNull(url, `${name} ${issue}`);

    if (html === null) {
      misses += 1;
      continue;
    }

    misses = 0;
    const product = parseEgmontProduct(html);

    if (product === null) {
      continue;
    }

    entries.push({
      number,
      title: product.title,
      coverUrl: product.coverUrl,
    });
    await sleep(BATCH_PAUSE_MS);
  }

  return entries;
}

/** Liest alle Bände einer Sonderedition aus der paginierten Übersicht. */
async function crawlSondereditionen({ name, year, slug }) {
  const baseUrl = `${SERIES_BASE}/sondereditionen`;
  const links = new Map();
  let page = 0;

  while (page < 20) {
    const url = page === 0 ? baseUrl : `${baseUrl}?page=${page}`;
    const label = `${name} (Übersicht ${url})`;
    const html = await fetchHtml(url, label);
    const pattern =
      /<a[^>]+href="([^"]*\/sondereditionen\/([^"]+))"[^>]*>([\s\S]*?)<\/a>/gi;
    let match = pattern.exec(html);

    while (match !== null) {
      const slugValue = match[2];
      const bandPattern = new RegExp(`^${year}-band-(\\d+)-${slug}-`);
      const band = bandPattern.exec(slugValue);

      if (band !== null) {
        const number = Number.parseInt(band[1], 10);
        const title = stripHtml(match[3]);

        if (Number.isSafeInteger(number) && !links.has(number)) {
          links.set(number, {
            url: match[1].startsWith("http")
              ? match[1]
              : `${OFFICIAL_SITE_BASE}${match[1]}`,
            title: title === "" ? null : title,
          });
        }
      }

      match = pattern.exec(html);
    }

    if (!/rel="next"/i.test(html)) {
      break;
    }

    page += 1;
    await sleep(BATCH_PAUSE_MS);
  }

  const entries = [];

  for (const number of [...links.keys()].sort((a, b) => a - b)) {
    const { url, title } = links.get(number);
    const html = await fetchHtml(url, `${name} Band ${number}`);
    const cover = /https:\/\/www\.lustiges-taschenbuch\.de\/sites\/default\/files\/cover\/[^"\s]+/i.exec(
      html,
    );

    entries.push({
      number,
      title,
      coverUrl: cover === null ? null : cover[0],
    });
    await sleep(BATCH_PAUSE_MS);
  }

  return entries;
}

async function previousCatalogStats() {
  try {
    const previous = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));

    if (!Array.isArray(previous.entries)) {
      return null;
    }

    const series = {};

    if (previous.series !== null && typeof previous.series === "object") {
      for (const [name, entries] of Object.entries(previous.series)) {
        const canonical = SERIES_ALIASES[name.toLowerCase()] ?? name;
        const count = Array.isArray(entries) ? entries.length : 0;

        series[canonical] = Math.max(series[canonical] ?? 0, count);
      }
    }

    return {
      entries: previous.entries.length,
      titles: previous.entries.filter((entry) => entry.title !== null).length,
      covers: previous.entries.filter((entry) => entry.coverUrl !== null).length,
      series,
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

  const temporaryFile = `${OUTPUT_FILE}.tmp`;

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(
    temporaryFile,
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryFile, OUTPUT_FILE);

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
