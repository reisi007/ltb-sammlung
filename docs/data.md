# Datenmodell und Datenquellen

Diese Seite beschreibt die Datendateien, ihre Herkunft und die Regeln für
Sammlungszeilen. Zurück zur [Startseite](../README.md).

## Datenmodell

`src/data/collection.json` ist der Seed/Snapshot, keine normalisierte
Datenbank. Die Datei wird lokal bzw. beim Deployment erzeugt und ist nicht
eingecheckt (`docs/decisions.md`). Auf dem Server ist die SQLite-Datenbank die
Quelle; die JSON-Datei dient nur dem ersten Start und dem Lesefallback:

```json
{
  "meta": { "sheetId": "...", "sheetUrl": "...", "syncedAt": "..." },
  "ltb": [{ "number": 219, "containedIn": "MM 4" }, { "number": 219, "containedIn": null }],
  "specials": [{ "name": "LTB-History", "numbers": [1, 2, 3] }],
  "donaldDuck": [{ "number": 201, "containedIn": null }],
  "panzerknacker": [{ "number": 2, "containedIn": null }]
}
```

Wichtig:

- **`containedIn` ist eine freie Notiz pro Sammlungszeile, kein Fremdschlüssel.**
  Dasselbe Label („MM 4“, „Mega Magnum 6“, …) kann bei mehreren verschiedenen
  LTB-Nummern stehen.
- Zeilen werden **nicht dedupliziert und nicht gejoint**. Die Nummer 219 darf
  zweimal vorkommen – einmal mit Notiz, einmal leer. Jede Zeile bleibt ein
  eigener Eintrag und wird als eigene Karte angezeigt.
- Sonderserien sind eine komplett getrennte Liste mit eigenen Nummernkreisen.
  Sie werden nicht mit den LTB-Nummern verknüpft.
- Die Nummern-Übersicht zählt eindeutige Nummern („vorhanden“), die Statistik
  zeigt daneben die Anzahl der Sheet-Zeilen. So bleiben Doppelerfassungen
  sichtbar, ohne die Kernfrage „Habe ich Nummer X?“ zu verfälschen.

`src/data/catalog.json` enthält pro LTB-Nummer optional einen Titel, eine
Duckipedia-Cover-URL, eine offizielle Cover-URL als Fallback und eine ISBN
(`isbn`, sonst `null`). Die App nutzt das erste vorhandene Bild und blendet bei
Ladefehlern auf einen Text-Fallback („Nr. X – Titel“) um.

## Datenquellen

- Google Sheet „LTBs“ (öffentlich per Link):
  <https://docs.google.com/spreadsheets/d/1-92-cWvC9F4LtSfQJf80mVzIGPmljo_VQ6rZXI6ihNc/edit>
- Duckipedia-Covergalerie:
  <https://de.duckipedia.org/wiki/Covergalerie_Lustiges_Taschenbuch>
- Duckipedia-Ausgabenliste (Bandtitel):
  <https://de.duckipedia.org/wiki/Ausgabenliste_Lustiges_Taschenbuch>
- Duckipedia-MediaWiki-API: <https://de.duckipedia.org/api.php>
- Duckipedia-Ausgaben mit Cover im Infobox-Feld `BILD` (Donald Duck, Panzerknacker & Co):
  `https://de.duckipedia.org/wiki/DD_<nummer>` bzw.
  `https://de.duckipedia.org/wiki/Panzerknacker_%26_Co_<nummer>`
- Egmont-Shop für Reihen, die nicht in der Nebenreihen-Übersicht stehen
  (Micky Maus Legacy Collection): `https://www.egmont-shop.de/<slug>-nr-<nr>/`
- Egmont-Shop-Produktseiten als mögliche ISBN-Quelle (optional):
  `https://www.egmont-shop.de/lustiges-taschenbuch-nr-<nummer>-<slug>/`
- Offizielle Cover-URLs als Fallback:
  `https://www.lustiges-taschenbuch.de/sites/default/files/cover/LTB-<nummer>.jpg`

Der Katalog-Sync liest nur den **ersten** `<gallery>`-Block der Covergalerie
(Neuauflagen-Galerien werden ignoriert) und die **erste** Titelzeile pro Nummer.
Sonderserien kommen aus der offiziellen Nebenreihen-Übersicht, Micky Maus
Legacy Collection aus dem Egmont-Shop, Donald Duck und Panzerknacker & Co aus
den jeweiligen Duckipedia-Infoboxen. Cover-Anfragen laufen in Batches à 50 mit
maximal zwei Retries und 150 ms Pause. Es werden ausschließlich URLs
gespeichert; keine Bilder heruntergeladen.

### ISBNs im Katalog

Der Katalog enthält nur ISBNs, die eine Quelle belegt. Stand November 2026
liefern die geprüften Produktseiten der **Egmont-Hauptreihe** weder `ISBN` in
den Produktdaten noch `gtin13` im JSON-LD — Stichproben über die Reihe (u. a.
Nr. 1, 219, 500 und 588) ergaben keinen Wert. Duckipedia, die offizielle
LTB-Seite und die DNB (HTTP 403) liefern ebenfalls keine ISBN. Die
Produktseiten der Nebenreihen tragen zwar teilweise eine ISBN, aber deren
Nummernkreis ist ein anderer; eine Übernahme in die Hauptreihe wäre falsch.
Ergänzend geprüft: Die Google-Books-API antwortet ohne eigenen API-Key mit
HTTP 429 (Tagesquote 0), Open Library hatte in Stichproben keinen Treffer für
Hauptreihen-Bände (u. a. Nr. 219).

Deshalb ist die ISBN-Anreicherung im Sync standardmäßig **aus**. Der
standardmäßig abgeschaltete Hook lässt sich mit
`LTB_CATALOG_ISBN=1 npm run sync:catalog` einschalten: Er liest die
Egmont-Sitemap und die Produktseiten der Hauptreihe
und übernimmt nur eine ISBN mit gültiger Prüfziffer, deren Produktname exakt
`Lustiges Taschenbuch Nr. <nummer>` nennt. Nennen mehrere Seiten einer Nummer
verschiedene ISBNs, wird die Nummer übersprungen. Ohne Beleg bleibt
`isbn: null` — es wird keine Nummer aus einem ISBN-Muster geraten. Vorhandene,
geprüfte ISBNs bleiben bei einem Lauf mit ausgeschaltetem Hook erhalten.

Reihennamen werden auf die offiziellen Schreibweisen abgebildet (z. B.
„Premium+“ → „LTB Premium +“, „Phantomias Collection“ → „LTB Phantomias
Collection“). Die Datenbank-Migration ist idempotent und führt vorhandene
Nummern zusammen; der Dialog schlägt bekannte Namen per Autocomplete vor.

## Google Sheet ohne Business-Konto

Der CSV-Export funktioniert ohne Google-Business-Konto und ohne API-Key, solange
das Sheet für „Jeder mit Link“ (Betrachter) freigegeben ist:

```text
https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv&gid=<GID>
```

Genau das nutzt `sync:data`. Für dieses Projekt reicht das, weil die Seite nur
lesend arbeitet. Der Snapshot liegt **nicht** im Repository, sondern nur lokal
bzw. auf dem Deploy-Host (`docs/decisions.md`); das Sheet selbst ist per Link
lesbar.

Alternativen, falls sich die Anforderungen ändern:

1. **„Im Web veröffentlichen“** (Datei → Freigeben → Im Web veröffentlichen):
   erzeugt eine separate öffentliche URL, die sich ebenfalls als CSV abrufen
   lässt. Sinnvoll, wenn die normale Link-Freigabe zu weit geht; veröffentlicht
   aber das gesamte Sheet.
2. **Google Sheets API** mit einem kostenlosen Google-Cloud-Projekt und einem
   API-Key: für öffentliche Sheets lesend möglich, ohne OAuth. Bei einer
   statischen Seite muss der Key auf die erlaubten Referrer beschränkt werden
   (z. B. `reisi007.github.io`, `ltb.all-the.rest` und `localhost:5173`).
   Quoten und Key-Sichtbarkeit
   bleiben ein Risiko.
3. **Google Apps Script als Web-App**: `doGet` liefert CSV/JSON, Deployment als
   „Jeder“. Kein API-Key nötig; Schreibzugriff lässt sich später mit
   Autorisierung im Script ergänzen.
4. **Eigene Datenbank**: Supabase Free, Cloudflare D1 oder SQLite plus
   GitHub Action. Maximale Kontrolle, erfordert aber einen eigenen Sync-/
   Auth-Schritt und ist für eine reine Leseansicht mehr Infrastruktur als nötig.
