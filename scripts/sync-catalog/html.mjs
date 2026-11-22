import { OFFICIAL_SITE_BASE } from "./constants.mjs";

export function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function stripHtml(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Liest eine Nebenreihen-Seite (eine Paginierungsseite) aus. Die Struktur ist:
 * <a href="…/band-133"><img src="…" alt="LTB Spezial 133 - Titel" />
 * <p><span class="field--name-title">Titel</span></p></a>
 */
export function parseSeriesPage(html, label) {
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

/** Liest die Produktdaten aus dem eingebetteten JSON einer Egmont-Seite. */
export function parseEgmontProductState(html) {
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
export function parseEgmontProduct(html) {
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
