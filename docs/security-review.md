# Security- und System-Review (final, 2026-11-21)

Geprüft wurde der Stand nach #10 (Multi-User), #11 (ISBN) und #12
(HTTP-API-Tests), inklusive Live-Deploy auf `https://ltb.all-the.rest`.

## Ergebnis

**Keine offenen kritischen oder hohen Befunde.** Der erste Review-Durchlauf
fand einen hohen Befund: Der Sammlungs-Snapshot lag als öffentliches Asset im
Build, seit die App-Hülle ohne Login erreichbar ist. Behoben; Details unten.
Weitere Härtungen (Body-Limit, Login-Timing, Sessions bei Benutzeränderungen,
Backup-Prüfungen) wurden im Review umgesetzt.

## Authentifizierung und Sessions

- Passwörter: `password_hash(PASSWORD_DEFAULT)`, Prüfung mit
  `password_verify()`. Auch bei unbekanntem Benutzernamen wird ein
  Dummy-Hash geprüft, damit die Antwortzeit keine Konten verrät.
- Session-Token: 32 zufällige Bytes (`random_bytes`), in der Datenbank liegt
  nur der SHA-256-Hash. Login erzeugt immer ein neues Token.
- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=43200`
  (12 h). Logout löscht Session und Cookie.
- Brute-Force: 10 Fehlversuche pro IP in 15 Minuten → 429, zusätzlich 250 ms
  Verzögerung; Fehlversuche werden nach 24 h bereinigt.
- Benutzerverwaltung nur per CLI (`api/bin/user.php`), keine
  Selbstregistrierung. Benutzernamen sind auf `a-z0-9._-` (max. 40) begrenzt.
- Passwortwechsel und Löschen eines Benutzers entfernen dessen Sessions
  sofort; `sessionUser()` prüft zusätzlich per Join gegen `users`.
- Kein `code-auth`/`forward_auth` mehr für diese Seite: PHP ist der
  Auth-Dienst, damit es keine zweite Cookie-Quelle und keinen festen
  `admin`-Nutzer gibt.

## Autorisierung und Mandantentrennung

- `owner` filtert **jede** Lese- und Schreibabfrage: Zeilen, Sonderserien,
  Seriennummern und ISBN-Zuordnungen.
- Zwei Benutzer sind im PHP-Test abgedeckt: eigene Zeilen/Reihen/ISBNs sind
  sichtbar, fremde nicht; bestehende Daten gehören `admin`, neue Nutzer starten
  leer.
- `occurrence` adressiert Duplikate pro Nummer; eine fremde Occurrence liefert
  404 und ändert nichts.

## HTTP-Schicht

- Body-Limit 8 KB: `Content-Length` **und** tatsächliche Body-Länge werden
  geprüft. Damit ist auch ein chunked-Body ohne `Content-Length` begrenzt
  (Härtung im Review, Test ergänzt).
- JSON-Fehler → 400, zu großer Body → 413, unbekannte Route → 404,
  Validierungsfehler → 422, fehlende Session → 401. Keine Stacktraces in der
  Antwort; Details nur in `error_log`. Auch die Store-Initialisierung liegt im
  `try` von `api/index.php`; `display_errors=0` ist zusätzlich in PHP und im
  FPM-Kommando gesetzt.
- CSRF: `SameSite=Lax` plus Origin-Prüfung gegen den eigenen Host bei allen
  schreibenden Requests.
- `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`,
  `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
  HSTS über das gemeinsame Caddy-Snippet.
- `expose_php=0`; live ist kein `X-Powered-By` gesetzt.

## Daten und SQL

- Ausschließlich Prepared Statements; keine String-Verkettung mit
  Benutzereingaben.
- ISBN-10/13 werden normalisiert und auf die Prüfziffer validiert, bevor
  gespeichert wird. Unbekannte ISBNs werden nicht geraten, sondern im Dialog
  einer Nummer zugeordnet.
- `containedIn` bleibt eine freie Notiz; Zeilen werden nie dedupliziert oder
  gejoint. Sonderserien haben eigene Nummernkreise.
- Validierung vor dem Schreiben: ein 422 hinterlässt weder eine leere Reihe
  noch eine Teilmenge.

## Betrieb und Backup

- PHP-Container nur im Docker-Netz `webnet`, keine veröffentlichten Ports,
  128 MB / 0,5 CPU, Healthcheck. Quellcode und Seed read-only eingehängt,
  Datenbank im Volume `ltb_ltb_data`.
- Backup: `deploy/ltb-vacuum.sh` läuft täglich 02:45 per Cron, schreibt
  `/var/backups/ltb/ltb-<Datum>.sqlite.gz` (14 Tage) und lädt sie per
  `rclone` nach `pCloud:Backup/strato-v2/db/ltb/`.
  - `VACUUM INTO` erzeugt eine konsistente Kopie bei laufendem Betrieb.
  - `PRAGMA integrity_check` und `COUNT(*) FROM rows > 0` vor dem Kopieren;
    eine valide, aber leere Sicherung wird nicht geschrieben.
  - Temporärdatei + atomares Umbenennen; keine halben oder leeren Dateien.
  - Dateien `0600`, Verzeichnis `0700`. Fehlt `rclone`, endet der Lauf mit
    Fehler statt still ohne Offsite-Kopie.
- Der Deploy überschreibt die Datenbank nicht (`rsync --delete` betrifft nur
  `dist/` und `api/`), legt den Benutzer aus `LTB_USER` nur an, wenn er fehlt,
  und bricht bei leerer/nicht geseedeter Datenbank ab.
- Wiederherstellung: `ltb-<Datum>.sqlite.gz` entpacken, in das Volume
  `ltb_ltb_data` als `ltb.sqlite` legen (Container vorher stoppen), Container
  starten; WAL-Dateien entfernen. Die Datei ist eine vollständige
  SQLite-Datenbank.
- Die Sicherung enthält die Passwort-Hashes (bcrypt) und wird unverschlüsselt
  zum pCloud-Konto des Betreibers geladen. Das ist bewusst so: ohne `users`
  wäre ein Restore nicht vollständig. Der pCloud-Zugang ist entsprechend zu
  schützen.
- Alte `code-auth`-Sessions sind nach dem Wechsel ungültig; eine erneute
  Anmeldung über die LTB-Login-Seite ist nötig.

## Öffentliche Hülle ohne private Daten

Die App-Hülle ist ohne Login erreichbar, weil Caddy `forward_auth` nicht gegen
PHP-FPM sprechen kann. Damit das keine Daten preisgibt:

- `src/lib/snapshot.ts` wird **nur** über `import.meta.env.DEV` dynamisch
  geladen. Ein Produktions-Build enthält weder den Snapshot-Import noch die
  Sammlungsdaten; der Build ist nachweislich frei von `"sheetId":"…"` und
  `"containedIn":"…"`.
- `scripts/assert-no-collection-data.mjs` prüft den Build formatunabhängig
  (auch minifizierte/unquotierte Snapshots) auf Sheet-ID, Sheet-URL und
  Notiz-Strings; `deploy.sh` bricht bei einem Treffer ab.
- Der Service Worker bereinigt veraltete Precache-Einträge
  (`cleanupOutdatedCaches`); der frühere Snapshot-Chunk ist serverseitig 404.
  Bereits im Browser-Cache liegende Kopien lassen sich von außen nicht
  erzwingen zu löschen, sind aber über die App nicht mehr erreichbar.
- Ohne Session antwortet `/api/*` mit 401; die App leitet nach `/login.html`.
  Ein 5xx wird als Fehler angezeigt, nicht als Nur-Lesen-Snapshot maskiert.

## Build-Abhängigkeiten (`npm audit`)

- `npm audit --omit=dev` meldet **0** Laufzeit-Schwachstellen; das
  ausgelieferte Bundle enthält keine davon.
- `npm audit` meldet 4 moderate Befunde ausschließlich im Build-Tooling:
  `vite-plugin-pwa` → `workbox-build` → `glob`/`minimatch` (DoS über
  globparts/AbortSignal, GHSA-g3hv-75wg-m249 und GHSA-3g3m-2fjr-6pw4).
  Betroffen sind nur Build/CI, nicht die App zur Laufzeit.
- Ein `npm audit fix --force` würde `vite-plugin-pwa` auf 1.1.0
  zurückstufen (breaking). Bewusst nicht; die Dependabot-Updates bleiben
  dafür der Weg. Sobald eine kompatible Version erscheint, wird aktualisiert.

## Bewusst akzeptierte Restpunkte

- Die App-Hülle ist ohne Login erreichbar (siehe oben). Die **Sammlungsdaten
  der API** liegen hinter `/api/*` und sind dort 401-geschützt; die
  **Sheet-Quelle** ist dagegen öffentlich per Link lesbar und wird durch den
  Login nicht geschützt. Der Katalog (Titel/Cover-Metadaten) ist ebenfalls
  öffentlich.
- Das Login-Limit zählt pro IP (nicht pro Konto). Für ein privates Projekt
  ausreichend; Caddy liefert die echte Client-IP als `REMOTE_ADDR`.
- Sessions laufen nach 12 h ab, ohne automatische Verlängerung.
- Es gibt keine Oberfläche für die Benutzerverwaltung (nur CLI, Issue #14).
- `meta.sheetId`/`meta.sheetUrl` sind globale Seed-Metadaten; die ID steht
  ohnehin im öffentlichen README. Sie zeigen auf die Quelle des Seeds, nicht
  auf benutzerspezifische Daten. `meta.updatedAt` nutzt für Benutzer ohne
  Zeilen deren Anlagezeitpunkt (nicht die aktuelle Zeit und nicht den globalen
  Seed-Zeitpunkt).
- Ein doppelter `X-Content-Type-Options`-Header (Caddy und PHP) ist bewusst
  hingenommen; beide Werte sind identisch (`nosniff`).

## Geprüfte Live-Pfade

- `/` → 200 (Hülle), `/login.html` → 200, Login-Assets → 200 ohne Cookie.
- `/api/collection` ohne Cookie → 401, mit Cookie → 200 (114 Zeilen,
  10 Sonderserien, `isbnMap` als Objekt).
- `PUT /api/isbn` gültig → 200, falsche Prüfziffer → 422, ohne Login → 401,
  fremder Origin → 403, `DELETE /api/isbn` → 200/404.
- Logout → 200, danach `/api/collection` → 401.
- Zweiter Benutzer: eigene leere Sammlung, keine Admin-Daten.
- Bundle-Prüfung: `dist/` enthält keine `sheetId`/`containedIn`-Daten;
  der Guard läuft in `npm run verify` (also auch in der CI) und im Deploy.
  Das alte minifizierte Format (`sheetId:\`…\``) wird erkannt.
- Migration einer Legacy-Datenbank ohne `owner` → admin, idempotent; neue
  Benutzer leer. Sessions enden bei Passwortwechsel/Löschen.
- Cross-User-Schreibversuche (`PATCH`/`DELETE` auf eine fremde Zeile) → 404,
  die fremde Zeile bleibt unverändert.
- Backup-Lauf am 2026-11-21: `VACUUM ok`, `integrity_check` ok, Upload nach
  pCloud ok; Restore-Probe der Tagesdatei ergab 120 Zeilen, 10 Reihen,
  1 Benutzer.

## Verbleibende Testlücken

- Kein automatisierter Test für `loadInitialData()` (DEV/Prod-Verzweigung);
  der anonyme Live-Aufruf `/` → `/login.html` wurde manuell geprüft.
- Die Legacy-Migration, `Api::forJson`, Sessions, `updatedAt` und
  Cross-User-Schreiben sind dagegen in `api/tests/run.php` abgedeckt.
