# Entscheidungen und Zielarchitektur

**Status:** In Arbeit — Entscheidungen vom 2026-11-21, Umsetzung teilweise offen.

Dieses Dokument hält die dauerhaften Entscheidungen fest. Offene Arbeit steht
als GitHub-Issue im Repository, nicht hier.

## 1. Sichtbarkeit: Code öffentlich, Daten privat

- Das Repository `reisi007/ltb-sammlung` bleibt **public** (Code, Doku, Tests).
- Sammlung und Katalog sind **privat**. Sie gehören nicht in das öffentliche
  Repository und nicht auf eine öffentliche GitHub-Pages-Seite.
- Daraus folgt:
  - `src/data/collection.json` und `src/data/catalog.json` werden **nicht
    eingecheckt**. Sie entstehen lokal bzw. beim Deployment über
    `npm run sync:data` und `npm run sync:catalog`.
  - Vor dem ersten Push müssen die Dateien aus der lokalen Git-Historie
    entfernt werden (bisher wurde nichts gepusht).
  - GitHub Pages bleibt **deaktiviert**. Der Pages-Workflow ist kein
    Auslieferungsweg für echte Daten.
- Die Auth auf `ltb.all-the.rest` ist damit **kein Vertraulichkeitsschutz für
  die Daten**, sondern nur eine Zugangsschranke für die Oberfläche. Diese
  Formulierung ist bewusst: wer die Daten hat, braucht die Seite nicht.

## 2. Authentifizierung: eigene Login-Seite, Ziel Multi-User

### Heute

- Eigene Login-Seite `login.html` (Teil des Vite-Builds, daisyUI-Komponenten:
  `card`, `fieldset`, `input`, `btn`, `alert`). Kein Browser-Basic-Dialog.
- Caddy nutzt `forward_auth` gegen den bestehenden `code-auth`-Sidecar
  (Cookie-Gate). `/api/login`, `/api/me`, `/api/logout` werden dorthin
  proxied. Damit gilt vorübergehend dasselbe Konto wie für
  `code.all-the.rest`.
- Der `code-auth`-Sidecar ist **Einzelnutzer** und ausdrücklich nur eine
  Übergangslösung.

### Ziel: eigener Auth-Dienst, mehrere Nutzer

Der Einzelnutzerbetrieb darf **nicht** das technische Limit sein. Der eigene
Dienst (Issue #2) bekommt mindestens:

```text
users(id, username UNIQUE, password_hash, role, created_at)
sessions(token_hash, user_id, expires_at, created_at)
```

- Passwörter als bcrypt/Argon2id-Hash, niemals im Klartext.
- Session-Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, zufälliges
  Token; in der Datenbank liegt nur der Hash des Tokens.
- Caddy prüft per `forward_auth` einen Endpunkt des Dienstes (z. B.
  `/api/check`) und übernimmt den Nutzer aus einem Header (`Remote-User`).
- Login-Seite postet weiterhin an `/api/login`; die Oberfläche bleibt
  unverändert.
- Nutzerverwaltung zunächst per CLI (anlegen, Passwort setzen, deaktivieren);
  Self-Registration ist **nicht** vorgesehen.
- Jede Sammlungszeile bekommt einen `user_id`-Bezug. Die bestehenden
  Sheet-Daten werden einem Startnutzer zugeordnet; weitere Nutzer starten
  leer.
- Die Datenregeln bleiben: `containedIn` ist eine freie Notiz, Zeilen werden
  nicht dedupliziert, Sonderserien bleiben getrennt.

### Übergang

Bis der eigene Dienst steht, bleibt `code-auth` aktiv. Der Wechsel ist ein
Caddy-Block plus Container; die Login-Seite und die API-Pfade bleiben gleich.

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

## 4. Auslieferung

- Statischer React-Build (`dist/`) auf dem VPS, ausgeliefert von Caddy aus
  `/srv/websites/ltb.all-the.rest`.
- Login-Seite und PWA-Assets liegen im selben Build.
- Später ergänzt ein PHP-FPM-Container die JSON-API (Issue #2); Caddy routet
  `/api/*` dorthin.
- GitHub Pages bleibt deaktiviert; der vorhandene Workflow ist kein
  Datenauslieferungsweg.

## 5. Offene Punkte (als Issues)

- **#2** PHP-API + SQLite, Multi-User-Auth, Schreibzugriff.
- **#5** Sonderserien-Cover (Umsetzung beschlossen).
- **#7** Daten aus dem öffentlichen Repo entfernen (Git-Historie, `.gitignore`,
  Build-/Deploy-Ablauf ohne eingecheckte JSONs).
