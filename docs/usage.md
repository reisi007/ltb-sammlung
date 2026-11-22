# Benutzung

Diese Seite beschreibt die Bedienung der App, die lokalen Scripts und die
Qualitätsgates. Zurück zur [Startseite](../README.md).

## Ansicht in der URL

Die URL ist die Quelle der Wahrheit für die Ansicht. Dadurch lässt sich jede
Ansicht teilen und nach Reload oder Zurück/Vorwärts wiederherstellen. Das
Pfadsegment bestimmt den Bereich, die Query-Parameter die Auswahl:

| URL | Bedeutung |
| --- | --- |
| `/ltb` | LTB-Übersicht (Standard) |
| `/specials` | Sonderserien |
| `/donald-duck` | Donald Duck & Co |
| `/panzerknacker` | Panzerknacker & Co |
| `?q=219` | Suche nach Nummer oder Titel, auch mehrere Nummern oder Freitext |
| `?series=Young` | gewählte Sonderserie (nur in `/specials`) |
| `?missing=1` | fehlende Nummern in der Nummern-Übersicht anzeigen |

Die Parameter stehen immer in der Reihenfolge `q`, `series`, `missing`, z. B.
`/specials?q=219&series=Young&missing=1`. Unbekannte und leere Werte werden
verworfen; beim Laden wird eine abweichende URL auf diese kanonische Form
korrigiert. Tabwechsel und die Auswahl einer Nummer bzw. Reihe schreiben einen
neuen History-Eintrag, das Tippen im Suchfeld und der Umschalter „Fehlende
anzeigen“ ersetzen den aktuellen Eintrag. Das Basispfad-Präfix aus
`vite.config.ts` (`/ltb-sammlung/` im Dev-Server, `/` im Deploy) wird
automatisch berücksichtigt. Die Anmeldung über `/login.html` bleibt unverändert.

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
| `npm run sync:catalog` | Cover-URLs, Titel und optional ISBNs (Duckipedia, offizielle Seite, Egmont-Shop) nach `src/data/catalog.json` |
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

## Bände erfassen (API)

Die App ist seit Version 1.0 nicht mehr nur lesend. Über **„Bände hinzufügen“**
lassen sich viele Bände pro Vorgang erfassen – per Text oder per
QR-/Barcode-Scan:

- Text: eine Nummer pro Zeile (`219`, `#219`, `LTB 219`). Mehrere Nummern
  dürfen durch Komma, Semikolon oder Zeilenumbruch getrennt eingegeben werden
  (`219, 220, 221`); jede Nummer wird zu einer eigenen Zeile mit eigener
  Notiz. Das gilt für die Hauptreihe und für Sonderserien.
- Die Obergrenze pro Vorgang ist bewusst hoch (200) und dient nur dem Schutz
  der API; die Suche bleibt bei drei Nummern.
- Scan: Kamera mit `BarcodeDetector` (QR, Code 128; EAN wird gelesen) oder
  `jsQR` als Fallback. Aus dem Payload wird die Nummer gelesen; fremde Inhalte
  werden abgelehnt statt geraten. Eine gedruckte **ISBN/EAN** wird
  normalisiert und über den Katalog bzw. die gelernten Zuordnungen
  (`isbnMap`) auf die LTB-Nummer abgebildet. Eine unbekannte ISBN führt zu
  einer klaren Rückfrage bzw. Fehlermeldung — es wird keine Nummer aus dem
  ISBN-Muster geraten. Ein QR-Code mit der Nummer funktioniert unverändert.
- Unbekannte Nummern sind erlaubt (Status „Nicht im Katalog“), ebenso doppelte
  Exemplare. Pro Exemplar entsteht eine Zeile; `containedIn` bleibt eine freie
  Notiz.
- Mehrfach vorhandene Nummern zeigt die Karte als runden Badge `×N` unten
  rechts über dem Cover; die Suche zeigt die Anzahl im Treffer-Badge.

Technik:

- **Frontend**: `CollectionRepository` (`src/lib/repository.ts`) liest
  `/api/collection`. Im Produktionsbuild gibt es **keinen** lokalen Snapshot:
  ohne Session leitet die App nach `/login.html`, ein Serverfehler wird als
  Fehler angezeigt. Nur im Dev-Betrieb (`import.meta.env.DEV`) fällt sie ohne
  API auf `src/data/collection.json` zurück (dann nur lesend), damit lokale
  Arbeit ohne PHP-Stack möglich ist. `WritableCollectionRepository` schreibt
  über `POST/PATCH/DELETE /api/ltb`.
- **API**: `api/index.php` (PHP 8, PDO/SQLite). Routen:
  `GET /api/collection`, `POST /api/ltb` (bis zu 200 Zeilen), `PATCH /api/ltb`,
  `DELETE /api/ltb`, `GET /api/lookup?isbn=…`, `GET /api/health`. Duplikate
  werden über `{ number, occurrence }` adressiert (0 = erste Zeile mit dieser
  Nummer).
- **ISBN-Lookup**: `GET /api/lookup?isbn=…` ist wie die Datenrouten
  auth-geschützt und prüft zuerst die gelernte Zuordnung des Benutzers, dann
  `catalog.entries[].isbn`. Treffer liefern
  `{ "isbn": "978…", "number": 219 }`, eine unbekannte ISBN 404 und eine
  ungültige ISBN 400. Der Container liest den Katalog über `LTB_CATALOG`
  (Standard `/srv/seed/catalog.json`); fehlt die Datei, antwortet der Lookup
  nur anhand von `isbnMap`. Der Deploy spiegelt `src/data/catalog.json` mit,
  wenn die Datei lokal vorhanden ist.
- **Auth**: Benutzer und Sessions liegen in SQLite (`users`, `sessions`); die
  API antwortet ohne gültiges Session-Cookie mit 401. Jede Zeile, jede Reihe
  und jede ISBN-Zuordnung gehört einem Benutzer (`owner`). Benutzerverwaltung
  per CLI: `docker exec -i ltb-php php /srv/api/bin/user.php add <name>`.
  Der PHP-Container hängt nur im dedizierten Docker-Netz `ltb-edge` (neben
  Caddy keine weiteren Teilnehmer). Das externe Netz muss auf dem Host vor
  dem Deploy angelegt sein: `docker network create ltb-edge`.
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
    (crontab -l 2>/dev/null | grep -v "/usr/local/bin/ltb-vacuum.sh"; \
     echo "45 2 * * * /usr/local/bin/ltb-vacuum.sh >> /var/log/ltb-vacuum.log 2>&1") | crontab -'
  ```

  Der `grep -v` entfernt vorhandene `ltb-vacuum`-Einträge vor dem Anhängen,
  sodass nach dem Befehl genau ein Eintrag übrig bleibt — auch wenn die
  Installation mehrfach läuft. Der Lauf um 02:45 liegt vor dem zentralen
  Backup um 03:00, das die Tagesdatei anschließend mitprüft.

  Wiederherstellung: Datei entpacken, PHP-Container stoppen, Entpacktes als
  `ltb.sqlite` in das Volume `ltb_ltb_data` legen, dabei `ltb.sqlite-wal` und
  `ltb.sqlite-shm` entfernen, Container starten. Die Sicherung ist eine
  vollständige SQLite-Datenbank.
- **Deployment**: `deploy.sh` spiegelt `api/` nach
  `/home/webadmin/websites/ltb-api`, den Seed nach
  `/home/webadmin/websites/ltb-seed`, installiert
  `deploy/ltb-stack/compose.yaml` nach `/opt/stacks/ltb` und startet den
  PHP-Stack per `docker compose up -d`. Voraussetzung ist das externe Netz
  `ltb-edge`; der Caddy-Stack muss daran angebunden sein (siehe
  `reisi007/caddyfile`, `deployment/docker-compose.yml`).

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
