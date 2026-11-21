# Entscheidungen und Zielarchitektur

**Status:** Version 1.0 umgesetzt (2026-11-21). Der eigene Multi-User-Auth-
Dienst ist mit #10 umgesetzt. Offen sind #11 (Katalog-ISBNs fehlen) und #14
(Benutzerverwaltung in der Oberfläche).

Dieses Dokument hält die dauerhaften Entscheidungen fest. Offene Arbeit steht
als GitHub-Issue im Repository, nicht hier.

## 1. Sichtbarkeit: Code öffentlich, Daten nicht im Repository

- Das Repository `reisi007/ltb-sammlung` bleibt **public** (Code, Doku, Tests).
- Sammlung und Katalog gehören **nicht ins Repository** und nicht auf eine
  öffentliche GitHub-Pages-Seite. „Nicht im Repository“ ist die eigentliche
  Zusage; die Sheet-Quelle ist öffentlich per Link lesbar (siehe unten).
- Daraus folgt:
  - `src/data/collection.json` und `src/data/catalog.json` werden **nicht
    eingecheckt**. Sie entstehen lokal bzw. beim Deployment über
    `npm run sync:data` und `npm run sync:catalog`.
  - Die Datendateien wurden nie gepusht und dürfen nicht in die
    Git-Historie gelangen.
  - GitHub Pages bleibt **deaktiviert**. Der Pages-Workflow ist kein
    Auslieferungsweg für echte Daten.
- Die Auth auf `ltb.all-the.rest` ist damit **kein Vertraulichkeitsschutz für
  die Daten**, sondern nur eine Zugangsschranke für die Oberfläche und die
  JSON-API. Diese Formulierung ist bewusst: Das Google Sheet ist weiterhin per
  Link lesbar (die ID steht u. a. in dieser Doku und im README), wer die Daten
  hat, braucht die Seite nicht. Wer Vertraulichkeit will, muss die
  Sheet-Freigabe ändern und die ID aus Doku/Skripten entfernen — der Login
  allein genügt nicht.

## 2. Authentifizierung: eigene Login-Seite, Ziel Multi-User

### Umgesetzt (Issue #10)

- Eigene Login-Seite `login.html` (Teil des Vite-Builds, daisyUI-Komponenten:
  `card`, `fieldset`, `input`, `btn`, `alert`). Kein Browser-Basic-Dialog.
- Die PHP-API ist der Auth-Dienst: `users`, `sessions` und `owner` liegen in
  derselben SQLite-Datenbank wie die Sammlung. `code-auth`/`forward_auth` sind
  für `ltb.all-the.rest` nicht mehr beteiligt.
- Weil PHP-FPM kein HTTP spricht, kann Caddy `forward_auth` nicht direkt
  gegen die API richten. Die App-Hülle ist deshalb ohne Cookie erreichbar;
  die App-Daten kommen aus `/api/*` und sind dort ohne gültige Session 401.
  Die App leitet bei 401 selbst nach `/login.html`. Das schützt die API, nicht
  die per Link lesbare Sheet-Quelle (siehe Abschnitt 1).
- Session-Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`; in der
  Datenbank liegt nur der SHA-256-Hash des Tokens. Login ist pro IP limitiert
  (10 Fehlversuche / 15 Minuten).
- Benutzerverwaltung per CLI (`api/bin/user.php`: `list`, `add`, `passwd`,
  `delete`); Self-Registration ist **nicht** vorgesehen.
- `owner` gilt für Zeilen, Sonderserien und ISBN-Zuordnungen. Bestehende
  Daten gehören `admin`, weitere Nutzer starten leer.

### Datenmodell

```text
users(username PK, password_hash, created_at)
sessions(token_hash PK, username, expires_at, created_at)
login_failures(address, attempted_at)
rows(owner, kind, number, contained_in, created_at)
series(owner, name, position)
series_numbers(owner, series, number)
isbn_map(owner, isbn, number, created_at)
```

- Passwörter als `password_hash()` (bcrypt/Argon2id je nach PHP-Default),
  niemals im Klartext.
- Die Datenregeln bleiben: `containedIn` ist eine freie Notiz, Zeilen werden
  nicht dedupliziert, Sonderserien bleiben getrennt.

## 3. Cover

- **Hauptreihe:** Duckipedia-Thumbnails (240 px) primär; die offizielle
  LTB-Website als Fallback. Die offiziellen URLs werden beim Sync per `HEAD`
  geprüft und folgen den echten Schemata (`LTB-<n>.jpg`,
  `ltb_Aktuell_<3-stellig>.jpg`, `ltb_<n>.jpg`, `ltb_1.NA_<n>.jpg`,
  `ltb_EA_<n>.jpg`).
- **Sonderserien:** Cover von `lustiges-taschenbuch.de/ausgaben/nebenreihen/<slug>`
  (Issue #5). Mapping:

  | Sheet | Slug |
  | --- | --- |
  | `LTB Spezial` | `spezial` |
  | `Enten Edition` | `enten-edition` |
  | `LTB-Premium` | `premium` |
  | `Premium+` | `ltb-premium-plus` |
  | `Ultimativer Phantomias` | `ultimate-phantomias` |
  | `Young` | `ltb-young-comics` |
  | `Halloween` | `halloween` |
  | `LTB-History` | `history` |
  | `Entenhausens Unterwelt` | keine Entsprechung — ohne Cover |

- **Rechte:** Cover werden ausschließlich verlinkt, nie heruntergeladen oder
  ins Repository gelegt. Der Service Worker darf sie zur Laufzeit cachen
  (30 Tage, max. 900 Einträge); das ist kein Hosting.
- **Optimierung (WebP/Resize): zurückgestellt.** Der VPS ist RAM-limitiert;
  ein eigener Bild-Proxy (`imgproxy`, PHP-Proxy) kostet Speicher und CPU.
  Bis auf Weiteres: direkte Thumbnails plus `loading="lazy"` und
  `decoding="async"`. Wenn später nötig, zuerst einen externen Image-CDN
  prüfen; ein self-hosted Proxy nur mit belegtem RAM-Budget.

## 4. Auslieferung und Datenhaltung

- Statischer React-Build (`dist/`) auf dem VPS, ausgeliefert von Caddy aus
  `/srv/websites/ltb.all-the.rest`.
- Login-Seite und PWA-Assets liegen im selben Build.
- Ein PHP-FPM-Container (`ltb-php`, Compose-Projekt `ltb`, 128 MB Limit)
  liefert die JSON-API; Caddy routet `/api/*` per FastCGI dorthin. Der
  Container ist nur im Docker-Netz `webnet` erreichbar.
- **SQLite ist die Quelle.** Sie liegt im Volume `ltb_ltb_data`; beim ersten
  Start wird sie aus `src/data/collection.json` geseedet. Danach schreibt nur
  noch die API. Das Google Sheet bleibt Seed, keine Rücksynchronisation.
- **Schreibmodell:** `GET /api/collection`, `POST /api/ltb` (1–3 Zeilen),
  `PATCH /api/ltb`, `DELETE /api/ltb`. Duplikate sind erlaubt und werden über
  `{ number, occurrence }` adressiert. Jede Zeile behält ihre freie Notiz.
- **Auth der API:** Sessions in SQLite; ohne gültiges Cookie antwortet die
  API mit 401. Schreibende Requests prüfen zusätzlich den `Origin` gegen den
  Host. Benutzerverwaltung per CLI.
- **Backup:** `deploy/ltb-vacuum.sh` läuft täglich um 02:45 per Cron (vor dem
  zentralen Server-Backup um 03:00, das die Tagesdatei mitprüft), schreibt
  `/var/backups/ltb/ltb-<Datum>.sqlite.gz` (`VACUUM INTO` plus
  `integrity_check`) und lädt sie per `rclone` hoch. Ein Deploy überschreibt
  die Datenbank nicht, weil `rsync --delete` nur `dist/` und `api/` betrifft.
- GitHub Pages bleibt deaktiviert; der vorhandene Workflow ist kein
  Datenauslieferungsweg.

## 5. Offene Punkte (als Issues)

- Benutzerverwaltung in der Oberfläche (heute CLI) — Issue #14.
- ISBN/EAN vom Cover auf die LTB-Nummer abbilden (Scanner) — Issue #11;
  Mechanismus und `isbn_map` sind umgesetzt, externe Quellen liefern keine
  ISBNs.
- Optional: Bearbeiten/Löschen in der Oberfläche (die API kann beides schon)
  und die Rücksynchronisation ins Google Sheet (bewusst nicht vorgesehen).
