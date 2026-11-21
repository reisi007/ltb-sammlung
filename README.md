# LTB-Sammlung

Persönliche Übersicht meiner Lustiges-Taschenbuch-Sammlung. Die App liest die
Sammlung über `/api/collection` aus SQLite und zeigt pro Zeile Cover, Bandtitel
und die freie Notiz „Enthalten in“. Zusätzlich gibt es eine Nummern-Übersicht
(1 bis zur höchsten vorhandenen Nummer), getrennte Tabs für Sonderserien,
Donald Duck und Panzerknacker & Co sowie eine Suche nach Nummer oder Titel.

Live: <https://ltb.all-the.rest/> (VPS, eigene Login-Seite und eigene
Benutzerverwaltung in SQLite — nicht mehr das Konto von
`code.all-the.rest`).

GitHub Pages ist **deaktiviert** und kein Auslieferungsweg für die Sammlung.
Die CI (`.github/workflows/ci.yml`) prüft nur Build und Gates.

## Entscheidungen

Dauerhafte Architektur-, Auth- und Cover-Entscheidungen stehen in
[`docs/decisions.md`](docs/decisions.md). Kurzfassung: Der Code ist öffentlich,
Sammlung und Katalog liegen nicht im Repository; die App hat eine eigene
Login-Seite mit mehreren Benutzern; GitHub Pages bleibt deaktiviert. Wichtig:
Das Google Sheet ist per Link lesbar — der Login schützt die Oberfläche und die
API, **nicht** die Sheet-Daten. Wer den Sheet-Link hat, braucht die App nicht.

## Schnellstart

Voraussetzung: Node.js ≥ 22.18 und npm.

```bash
npm install
npm run sync:data      # Sammlung aus dem Google Sheet (nicht im Repo)
npm run sync:catalog   # Cover und Titel (nicht im Repo)
npm run dev
```

Die echten Datendateien `src/data/collection.json` und
`src/data/catalog.json` sind bewusst **nicht eingecheckt**. Fehlen sie, legt
der Build leere Platzhalter aus den `*.example.json` an; für echte Daten
müssen die Sync-Scripts laufen. `npm run data:check` prüft das vor einem
Deploy.

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
| `npm run data:check` | prüft, dass echte Daten statt der Platzhalter vorliegen |
| `npm run icons` | erzeugt die PWA-PNGs aus `public/icon*.svg` |
| `npm run test:screenshots` | UI-Review: Screenshots der Live-Seite (Desktop + Mobil) nach `test-results/ui-screenshots/` |

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

## Bände erfassen (API)

Die App ist seit Version 1.0 nicht mehr nur lesend. Über **„Bände hinzufügen“**
lassen sich **bis zu drei Bände pro Vorgang** erfassen – per Text oder per
QR-/Barcode-Scan:

- Text: eine Nummer pro Zeile (`219`, `#219`, `LTB 219`), bis zu drei Zeilen.
  Im **Sonderserien**-Dialog dürfen mehrere Nummern durch Komma getrennt
  eingegeben werden (`1, 2, 3`).
- Scan: Kamera mit `BarcodeDetector` (QR, Code 128; EAN wird gelesen, aber
  als Nummer abgelehnt) oder `jsQR` als Fallback.
  Aus dem Payload wird die Nummer gelesen; fremde Inhalte werden abgelehnt
  statt geraten. Die gedruckte **ISBN/EAN** eines Bandes enthält die
  LTB-Nummer nicht und wird deshalb abgelehnt (kein Nummernraten); ein
  QR-Code mit der Nummer funktioniert.
- Unbekannte Nummern sind erlaubt (Status „Nicht im Katalog“), ebenso doppelte
  Exemplare. Pro Exemplar entsteht eine Zeile; `containedIn` bleibt eine freie
  Notiz.
- Mehrfach vorhandene Nummern zeigt die Karte als `×N`, die Suche als Badge und
  der Abschnitt „Mehrfach vorhanden“ als filterbare Übersicht.

Technik:

- **Frontend**: `CollectionRepository` (`src/lib/repository.ts`) liest
  `/api/collection`. Im Produktionsbuild gibt es **keinen** lokalen Snapshot:
  ohne Session leitet die App nach `/login.html`, ein Serverfehler wird als
  Fehler angezeigt. Nur im Dev-Betrieb (`import.meta.env.DEV`) fällt sie ohne
  API auf `src/data/collection.json` zurück (dann nur lesend), damit lokale
  Arbeit ohne PHP-Stack möglich ist. `WritableCollectionRepository` schreibt
  über `POST/PATCH/DELETE /api/ltb`.
- **API**: `api/index.php` (PHP 8, PDO/SQLite). Routen:
  `GET /api/collection`, `POST /api/ltb` (1–3 Zeilen), `PATCH /api/ltb`,
  `DELETE /api/ltb`, `GET /api/health`. Duplikate werden über
  `{ number, occurrence }` adressiert (0 = erste Zeile mit dieser Nummer).
- **Auth**: Benutzer und Sessions liegen in SQLite (`users`, `sessions`); die
  API antwortet ohne gültiges Session-Cookie mit 401. Jede Zeile, jede Reihe
  und jede ISBN-Zuordnung gehört einem Benutzer (`owner`). Benutzerverwaltung
  per CLI: `docker exec -i ltb-php php /srv/api/bin/user.php add <name>`.
  Der PHP-Container ist nur im Docker-Netz `webnet` erreichbar.
- **CSRF**: SameSite=Lax-Cookie plus Origin-Prüfung gegen den eigenen Host bei
  schreibenden Requests.
- **Datenbank**: SQLite im Volume `ltb_ltb_data` (Host:
  `/var/lib/docker/volumes/ltb_ltb_data/`). Beim ersten Start wird sie aus
  `src/data/collection.json` geseedet; danach ist sie die Quelle. Die
  Sicherung läuft als Cronjob (`deploy/ltb-vacuum.sh`) und schreibt
  `/var/backups/ltb/ltb-YYYY-MM-DD.sqlite.gz` (14 Tage, zusätzlich per
  `rclone` nach `pCloud:Backup/strato-v2/db/ltb/`). `VACUUM INTO` erzeugt
  eine konsistente Kopie, auch während geschrieben wird; die laufenden
  Dateien werden nie getarrt.

  Installation auf dem VPS (einmalig, Datei liegt im Repo):

  ```bash
  scp deploy/ltb-vacuum.sh root@reisinger.pictures:/usr/local/bin/ltb-vacuum.sh
  ssh root@reisinger.pictures 'chmod 755 /usr/local/bin/ltb-vacuum.sh; \
    (crontab -l 2>/dev/null; \
     echo "23 3 * * * /usr/local/bin/ltb-vacuum.sh >> /var/log/ltb-vacuum.log 2>&1") | crontab -'
  ```

  Wiederherstellung: Datei entpacken, PHP-Container stoppen, Entpacktes als
  `ltb.sqlite` in das Volume `ltb_ltb_data` legen, dabei `ltb.sqlite-wal` und
  `ltb.sqlite-shm` entfernen, Container starten. Die Sicherung ist eine
  vollständige SQLite-Datenbank.
- **Deployment**: `deploy.sh` spiegelt `api/` nach
  `/home/webadmin/websites/ltb-api`, den Seed nach
  `/home/webadmin/websites/ltb-seed`, installiert
  `deploy/ltb-stack/compose.yaml` nach `/opt/stacks/ltb` und startet den
  PHP-Stack per `docker compose up -d`.

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

`.github/workflows/ci.yml` läuft bei Push und Pull Request: `npm ci`,
`npm run verify`, `ratchet check --no-ratchet`. Es gibt **keinen**
Pages-Deploy; Pages bleibt deaktiviert.

Der Basispfad ist in `vite.config.ts` auf `/ltb-sammlung/` gesetzt und kann per
`BASE_PATH` überschrieben werden. Für die eigene Domain setzt `deploy.sh`
`BASE_PATH=/`.

### Deployment auf ltb.all-the.rest

`./deploy.sh` baut mit `BASE_PATH=/` und spiegelt `dist/` per rsync nach
`/home/webadmin/websites/ltb.all-the.rest/` auf `root@reisinger.pictures`. Im
`proxy-stack` ist dieser Pfad read-only unter `/srv/websites/ltb.all-the.rest`
eingehängt; der Caddy-Block liegt im Repo `~/dev/caddyfile/Caddyfile` und nutzt
das `spa`-Snippet. Die Anmeldung macht die PHP-API selbst
(`/api/login`, `/api/me`, `/api/logout`, Sessions in SQLite); `code-auth` und
`forward_auth` sind für diese Seite nicht mehr beteiligt. `/login.html` und die
App-Hülle sind ohne Cookie erreichbar, alle Daten unter `/api/*` antworten
ohne gültige Session mit 401. Mehrere Personen haben getrennte Sammlungen.
`./deploy.sh --dry-run` zeigt die Schritte ohne Upload. Der PHP-Stack
(`php:8.3-fpm-alpine`, 128 MB Memory-Limit) läuft als eigenes Compose-Projekt
`ltb`; die Caddy-Konfiguration routet `/api/*` per FastCGI dorthin.
`LTB_USER` und `LTB_PASSWORD` sind beim Deploy **Pflicht**: Das Script meldet
sich über die API an und bricht ab, wenn die Sammlung nicht aus SQLite kommt
oder keine LTB-Zeilen liefert. Ein grüner Deploy mit leerer Datenbank ist damit
ausgeschlossen.

Die App ist eine Progressive Web App (`vite-plugin-pwa`): `manifest.webmanifest`,
Service Worker und Icons unter `public/icons/`. Die Icons sind ein eigenes,
bewusst einfaches Design („LTB" auf einfarbigem Grund) und kopieren kein
offizielles Logo. Cover werden nicht mitgeliefert; der Service Worker cached sie
nur zur Laufzeit (30 Tage, maximal 900 Einträge).

Voraussetzung: GNU-rsync ≥ 3.1 (`brew install rsync`) und ein SSH-Key für den
Host. Das Script legt das Zielverzeichnis bei Bedarf an (`1002:webgroup`, Modus
`2755`), prüft vor dem Upload, dass `dist/index.html`, `dist/login.html`,
`dist/sw.js` und `dist/manifest.webmanifest` vorhanden sind und der Build den
Root-Basispfad `/assets/` verwendet. Nach dem Sync testet er
`https://ltb.all-the.rest/` (App-Hülle, `200`) und lädt `/login.html` samt der
dort referenzierten Assets ohne Cookie (je `200`). Danach legt er den Benutzer
aus `LTB_USER` an, falls er fehlt, meldet sich an und prüft die SQLite-Daten.

### UI-Review (Screenshots)

`npm run test:screenshots` (Playwright, Chromium einmalig mit
`npx playwright install chromium`) erfasst die Live-Seite in Desktop- und
Mobilgröße: Anmeldung, Sammlung, Sonderserien und beide Hinzufügen-Dialoge.
Die Routen und Zustände stehen in `e2e/screenshots/manifest.ts`, die Bilder
landen unter `test-results/ui-screenshots/` (nicht im Repository). Zugang über
`UI_REVIEW_USER`/`UI_REVIEW_PASSWORD`; ein lokales Ziel per
`UI_REVIEW_BASE_URL`. Der Lauf ist bewusst nicht Teil der CI, weil er gegen die
Live-Instanz geht.

## Cover-Rechte

Die Cover sind urheberrechtlich geschützt (© Disney/Egmont). Dieses Projekt
lädt keine Cover herunter und hostet keine Bilder: Es speichert nur URLs und
hotlinkt die Quellen. Rechte liegen bei den jeweiligen Rechteinhabern. Das ist
ein privates Fan-Projekt und kein offizielles Angebot von Disney, Egmont oder
Google.

## Security- und System-Review

Der finale Review (Auth, Sessions, Mandantentrennung, HTTP-Härtung, Backup)
steht in [`docs/security-review.md`](docs/security-review.md). Ergebnis: keine
offenen kritischen oder hohen Befunde; Body-Limit und Login-Timing wurden im
Review gehärtet.

## Version

Aktuell ist **1.0.0**. Die Version steht in `package.json` und wird beim Build
als `__APP_VERSION__` in den Footer geschrieben.

## Roadmap

- **Bearbeiten/Löschen in der Oberfläche**: Die API kann `PATCH` und `DELETE`
  bereits; die UI nutzt bisher nur das Hinzufügen. Als Nächstes: Notiz ändern
  und einzelne Exemplare entfernen.
- **Mehrere Nutzer**: `users`/`sessions` und `owner` pro Zeile sind umgesetzt
  (#10). Offen bleibt nur eine Oberfläche für die Benutzerverwaltung; heute
  läuft sie per CLI.
- **Synchronisation**: Das Sheet bleibt Seed. Eine Rücksynchronisation der
  SQLite-Daten ins Sheet ist nicht vorgesehen.
