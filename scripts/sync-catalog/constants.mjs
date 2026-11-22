import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const API_URL = "https://de.duckipedia.org/api.php";
export const COVER_PAGE = "Covergalerie_Lustiges_Taschenbuch";
export const ISSUE_PAGE = "Ausgabenliste_Lustiges_Taschenbuch";
export const OFFICIAL_COVER_BASE =
  "https://www.lustiges-taschenbuch.de/sites/default/files/cover";
export const OFFICIAL_SITE_BASE = "https://www.lustiges-taschenbuch.de";
export const SERIES_BASE = `${OFFICIAL_SITE_BASE}/ausgaben/nebenreihen`;

/**
 * Sheet-Name -> Slug der offiziellen Nebenreihen-Seite. Reihen ohne sichere
 * Entsprechung (z. B. „Entenhausens Unterwelt") bleiben bewusst weg und
 * bekommen kein Cover.
 */
export const SPECIAL_SERIES = [
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
export const EGMONT_SERIES = [
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
export const SONDEREDITIONEN = [
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
export const DUCKIPEDIA_SERIES = [
  { name: "Donald Duck", pagePrefix: "DD " },
  { name: "Panzerknacker & Co", pagePrefix: "Panzerknacker & Co " },
];

/**
 * Frühere Namen aus der Sammlung -> offizielle Schreibweise. Wird für den
 * Vergleich mit dem vorhandenen Katalog genutzt, damit eine reine Umbenennung
 * nicht als geschrumpfte Reihe gilt.
 */
export const SERIES_ALIASES = {
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
export const OUTPUT_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/data/catalog.json",
);
export const USER_AGENT =
  "ltb-sammlung/0.1 (+https://github.com/reisi007/ltb-sammlung)";
export const REQUEST_TIMEOUT_MS = 45_000;
export const BATCH_SIZE = 50;
export const BATCH_PAUSE_MS = 150;
export const MAX_RETRIES = 2;

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
export const ISBN_ENRICHMENT_ENABLED = process.env.LTB_CATALOG_ISBN === "1";
export const EGMONT_SITEMAP_URL = "https://www.egmont-shop.de/sitemap.xml";
export const EGMONT_MAIN_SERIES_PATTERN =
  /<loc>(https:\/\/www\.egmont-shop\.de\/lustiges-taschenbuch-nr-(\d+)-[^<]+)<\/loc>/g;
