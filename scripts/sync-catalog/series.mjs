import {
  BATCH_PAUSE_MS,
  BATCH_SIZE,
  OFFICIAL_COVER_BASE,
  OFFICIAL_SITE_BASE,
  SERIES_BASE,
} from "./constants.mjs";
import { parseSeriesPage, stripHtml } from "./html.mjs";
import { apiUrl, fetchHtml, fetchJson, sleep, urlExists } from "./http.mjs";
import { normalizeTitle, resolveRequestedTitle } from "./wiki.mjs";

export function officialCoverCandidates(number) {
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

/**
 * Probiert die bekannten Dateinamen-Schemata der offiziellen Seite durch und
 * gibt nur URLs zurück, die wirklich mit HTTP 2xx antworten. Die Muster
 * unterscheiden sich je nach Erscheinungszeitraum (LTB-123.jpg,
 * ltb_Aktuell_016.jpg, ltb_216.jpg).
 */
export async function resolveOfficialCoverUrls(numbers) {
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

export async function resolveCoverUrls(files) {
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

export async function crawlSeries({ name, slug }) {
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

/** Liest alle Bände einer Sonderedition aus der paginierten Übersicht. */
export async function crawlSondereditionen({ name, year, slug }) {
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
