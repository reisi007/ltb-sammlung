import { BATCH_PAUSE_MS, BATCH_SIZE } from "./constants.mjs";
import { parseEgmontProduct } from "./html.mjs";
import {
  apiUrl,
  fetchHtmlOrNull,
  fetchJson,
  sleep,
} from "./http.mjs";
import { resolveCoverUrls } from "./series.mjs";
import { normalizeTitle, parseInfoboxCover } from "./wiki.mjs";

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

export async function crawlDuckipediaSeries({ name, pagePrefix }) {
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

export async function crawlEgmontSeries({ name, slug, maxIssues }) {
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
