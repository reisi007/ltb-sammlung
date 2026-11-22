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

## Dokumentation

| Thema | Datei |
| --- | --- |
| Bedienung, URL-Ansicht, Scripts, Bände erfassen, i18n, Qualitätsgates | [`docs/usage.md`](docs/usage.md) |
| Datenmodell, Datenquellen, Google-Sheet-Zugriff | [`docs/data.md`](docs/data.md) |
| CI, Deployment auf `ltb.all-the.rest`, UI-Review | [`docs/deployment.md`](docs/deployment.md) |
| Architektur-, Auth- und Cover-Entscheidungen | [`docs/decisions.md`](docs/decisions.md) |
| Security- und System-Review | [`docs/security-review.md`](docs/security-review.md) |

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

## Bände erfassen

Über **„Bände hinzufügen“** lassen sich viele Bände pro Vorgang erfassen – per
Text (eine oder mehrere Nummern, getrennt durch Komma, Semikolon oder
Zeilenumbruch) oder per QR-/Barcode-Scan. Eine gedruckte ISBN wird über den
Katalog bzw. gelernte Zuordnungen auf die LTB-Nummer abgebildet; unbekannte
Nummern und doppelte Exemplare sind erlaubt. Details zu API, Auth und den
Scan-Fällen stehen in [`docs/usage.md`](docs/usage.md#bände-erfassen-api).

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
