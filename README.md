# LTB-Sammlung

Persönliche, statische Übersicht meiner Lustiges-Taschenbuch-Sammlung.
Die App liest einen Snapshot des Google Sheets und zeigt pro Sammlungszeile
Cover, Bandtitel und die freie Notiz „Enthalten in“. Zusätzlich gibt es eine
Nummern-Übersicht (1 bis zur höchsten vorhandenen Nummer), getrennte Tabs für
Sonderserien, Donald Duck und Panzerknacker & Co sowie eine Suche nach Nummer
oder Titel.

Live: <https://ltb.all-the.rest/> (VPS, Basic-Auth mit dem Konto von
`code.all-the.rest`).

GitHub Pages wird über `.github/workflows/deploy.yml` ausgeliefert, sobald im
Repo unter **Pages** die Quelle **GitHub Actions** eingestellt ist. Ohne diese
Einstellung ist `https://reisi007.github.io/ltb-sammlung/` nicht erreichbar.

## Schnellstart

Voraussetzung: Node.js ≥ 22.18 und npm.

```bash
npm install
npm run dev
```

Der Dev-Server läuft wegen des GitHub-Pages-Basispfads unter
<http://localhost:5173/ltb-sammlung/>.

## Scripts

| Script | Zweck |
| --- | --- |
| `npm run dev` | Vite-Dev-Server |
| `npm run build` | Produktionsbuild nach `dist/` |
| `npm run preview` | Build lokal ansehen |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run test` | Vitest einmalig |
| `npm run verify` | Typecheck, Tests und Build nacheinander |
| `npm run sync:data` | Vier CSV-Tabs des Google Sheets nach `src/data/collection.json` |
| `npm run sync:catalog` | Cover-URLs und Titel von Duckipedia nach `src/data/catalog.json` |
| `npm run i18n:extract` | Nachrichten aus `src/` in die `.po`-Kataloge extrahieren |
| `npm run i18n:compile` | `.po`-Kataloge kompilieren (der Vite-Plugin kompiliert sonst beim Build) |

### Daten-Sync konfigurieren

`sync:data` liest standardmäßig das Sheet
`1-92-cWvC9F4LtSfQJf80mVzIGPmljo_VQ6rZXI6ihNc` mit den bekannten GIDs.
Überschreiben per Umgebungsvariable:

```bash
SHEET_ID=... LTB_GID=0 SPECIALS_GID=643921616 \
DONALD_DUCK_GID=1340377721 PANZERKNACKER_GID=1496243958 \
npm run sync:data
```

Beide Sync-Scripts schreiben erst, wenn alle Abrufe erfolgreich waren. Bei
Netzwerk-, HTTP- oder Formatfehlern brechen sie mit einer klaren Meldung ab und
lassen die vorhandene JSON-Datei unangetastet.

## Datenmodell

`src/data/collection.json` ist ein Snapshot, keine normalisierte Datenbank:

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
Duckipedia-Cover-URL und eine offizielle Cover-URL als Fallback. Die App nutzt
das erste vorhandene Bild und blendet bei Ladefehlern auf einen Text-Fallback
(„Nr. X – Titel“) um.

## Datenquellen

- Google Sheet „LTBs“ (öffentlich per Link):
  <https://docs.google.com/spreadsheets/d/1-92-cWvC9F4LtSfQJf80mVzIGPmljo_VQ6rZXI6ihNc/edit>
- Duckipedia-Covergalerie:
  <https://de.duckipedia.org/wiki/Covergalerie_Lustiges_Taschenbuch>
- Duckipedia-Ausgabenliste (Bandtitel):
  <https://de.duckipedia.org/wiki/Ausgabenliste_Lustiges_Taschenbuch>
- Duckipedia-MediaWiki-API: <https://de.duckipedia.org/api.php>
- Offizielle Cover-URLs als Fallback:
  `https://www.lustiges-taschenbuch.de/sites/default/files/cover/LTB-<nummer>.jpg`

Der Katalog-Sync liest nur den **ersten** `<gallery>`-Block der Covergalerie
(Neuauflagen-Galerien werden ignoriert) und die **erste** Titelzeile pro Nummer.
Cover-Anfragen laufen in Batches à 50 mit maximal zwei Retries und 150 ms Pause.
Es werden ausschließlich URLs gespeichert; keine Bilder heruntergeladen.

## Google Sheet ohne Business-Konto

Der CSV-Export funktioniert ohne Google-Business-Konto und ohne API-Key, solange
das Sheet für „Jeder mit Link“ (Betrachter) freigegeben ist:

```text
https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv&gid=<GID>
```

Genau das nutzt `sync:data`. Für dieses Projekt reicht das, weil die Seite nur
lesend arbeitet und der Snapshot im Repository liegt.

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

## Schreibzugriff (geplant)

Bearbeiten ist in diesem Prototyp bewusst **nicht** implementiert. Der Button
„Bearbeiten folgt“ ist deaktiviert. Statt Google OAuth wird der Schreibzugriff
über die vorhandene Infrastruktur realisiert (Issue #2):

- React bleibt das komplette Frontend; PHP wird nur eine schmale JSON-API über
  SQLite (`/api/collection`, `/api/lookup`). PHP rendert keine UI und enthält
  keine UI-Strings – Lingui bleibt die einzige i18n-Quelle.
- SQLite liegt in einem Docker-Volume außerhalb des Web-Roots. Das Google Sheet
  bleibt die initiale Datenquelle (Seed), danach ist SQLite die Wahrheit.
- Caddy macht die Authentifizierung per `basic_auth` mit demselben User und
  bcrypt-Hash wie `code.all-the.rest`; PHP vertraut nur dem von Caddy gesetzten
  `X-Auth-User`-Header. Schreibende Requests brauchen einen Custom-Header als
  CSRF-Schutz.
- Deployment nach dem Muster des Projekts `form2email`: PHP-FPM-Container im
  `webnet`, Compose in `deployment/`, Sync per rsync.
- `CollectionRepository` (`src/lib/repository.ts`) bleibt die Abstraktion:
  `/api/collection` zuerst, Snapshot `src/data/collection.json` als Fallback für
  den statischen Betrieb. `WritableCollectionRepository` beschreibt bereits den
  Schreibvertrag mit `addLtbRow`, `updateLtbRow` und `removeLtbRow`; doppelte
  Nummern werden über `{ number, occurrence }` adressiert.

## Internationalisierung

Die Oberfläche ist vollständig über Lingui internationalisiert (`de` ist
Quellsprache, `en` ist übersetzt). Die Kataloge liegen als `.po` unter
`src/locales/<locale>/messages.po` und werden vom Vite-Plugin beim Import
kompiliert:

```ts
const { messages } = await import(`./locales/${locale}/messages.po`);
```

Neue sichtbare Strings mit `<Trans>` (JSX) oder `t` (Attribute/Platzhalter)
anlegen, dann:

```bash
npm run i18n:extract
npm run i18n:compile
```

Die kompilierten `messages.mjs` sind generiert und werden nicht eingecheckt.

## Qualitätsgates (ratchet)

[ratchet](https://github.com/all-the-rest/ratchet-cli) zählt Defektklassen und
lässt sie nur in die erlaubte Richtung wandern. Die Regeln stehen in
`ratchet.config.jsonc`:

| Regel | Richtung | Zählt |
| --- | --- | --- |
| `todo-markers` | ceiling | `TODO` in `*.ts`/`*.tsx` |
| `any-types` | ceiling | `: any` und `as any` |
| `console-log` | ceiling | `console.log` |
| `ts-errors` | ceiling | TypeScript-Fehler |
| `test-count` | floor | `it(`/`test(` in Testdateien |

Installation (Beispiel macOS arm64, Version 0.8.0):

```bash
curl -fsSL -o /usr/local/bin/ratchet \
  https://github.com/all-the-rest/ratchet-cli/releases/download/v0.8.0/ratchet-0.8.0-macos-aarch64
chmod +x /usr/local/bin/ratchet
```

Die Baseline `ratchet.baseline.json` wird einmal mit `ratchet baseline init`
erzeugt und eingecheckt. Lokal und in CI gilt:

```bash
npm run verify
ratchet check --no-ratchet
```

`--no-ratchet` prüft nur und schreibt die Baseline nicht.

## Deployment

`.github/workflows/deploy.yml` baut bei jedem Push auf `main` und deployt nach
GitHub Pages. Einmalig in den Repository-Einstellungen unter **Pages** als
Quelle **GitHub Actions** auswählen.

Der Basispfad ist in `vite.config.ts` auf `/ltb-sammlung/` gesetzt und kann per
`BASE_PATH` überschrieben werden. Für eine eigene Domain oder ein anderes
Repository muss `BASE_PATH` entsprechend gesetzt werden.

### Deployment auf ltb.all-the.rest

`./deploy.sh` baut mit `BASE_PATH=/` und spiegelt `dist/` per rsync nach
`/home/webadmin/websites/ltb.all-the.rest/` auf `root@reisinger.pictures`. Im
`proxy-stack` ist dieser Pfad read-only unter `/srv/websites/ltb.all-the.rest`
eingehängt; der Caddy-Block liegt im Repo `~/dev/caddyfile/Caddyfile` und nutzt
das `spa`-Snippet. Der Zugang ist `basic_auth` mit demselben User und Hash wie
`code.all-the.rest`. `./deploy.sh --dry-run` zeigt die Schritte ohne Upload.

Voraussetzung: GNU-rsync ≥ 3.1 (`brew install rsync`) und ein SSH-Key für den
Host. Das Script legt das Zielverzeichnis bei Bedarf an (`1002:webgroup`, Modus
`2755`), prüft vor dem Upload, dass `dist/index.html` den Root-Basispfad
`/assets/` verwendet, und testet nach dem Sync `https://ltb.all-the.rest/`
(ohne Zugangsdaten erwartet: `401`).

## Cover-Rechte

Die Cover sind urheberrechtlich geschützt (© Disney/Egmont). Dieses Projekt
lädt keine Cover herunter und hostet keine Bilder: Es speichert nur URLs und
hotlinkt die Quellen. Rechte liegen bei den jeweiligen Rechteinhabern. Das ist
ein privates Fan-Projekt und kein offizielles Angebot von Disney, Egmont oder
Google.

## Roadmap

- **QR-Scan**: Der Button ist ein deaktivierter Platzhalter. Geplant ist das
  Scannen einer Nummer per Kamera (z. B. BarcodeDetector/getUserMedia) mit
  anschließender Suche.
- **Bearbeiten**: PHP-API + SQLite hinter Caddy, siehe Abschnitt oben (Issue #2).
  Kein halbfertiger OAuth-Code in diesem Prototyp.
