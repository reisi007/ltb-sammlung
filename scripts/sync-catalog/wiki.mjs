export function parsePageWikitext(data, label) {
  const wikitext = data?.parse?.wikitext?.["*"];

  if (typeof wikitext !== "string" || wikitext.trim() === "") {
    throw new Error(`${label}: Unerwartete API-Antwort ohne Wikitext.`);
  }

  return wikitext;
}

export function normalizeTitle(value) {
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function parseCoverFiles(wikitext) {
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

export function cleanWikiText(value) {
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

export function parseTitles(wikitext) {
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

export function resolveRequestedTitle(requestedTitle, data) {
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

/** Liest das erste Cover (`|BILD=`) aus Infobox-Wikitext. */
export function parseInfoboxCover(wikitext) {
  const match = /\|\s*BILD\s*=\s*(?:\[\[)?(?:Datei|File|Image):([^|\]\n]+)/i.exec(
    wikitext,
  );

  return match === null ? null : match[1].trim();
}
