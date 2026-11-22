# Deployment

Diese Seite beschreibt CI, den Deploy auf `ltb.all-the.rest` und den
UI-Review. Zurück zur [Startseite](../README.md).

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
