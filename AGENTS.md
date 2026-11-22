# AGENTS.md

## Grün

`npm run verify` (tsc, vitest, build, Daten-Check) und
`ratchet check --no-ratchet` müssen ohne Fehler laufen. Die Baseline
`ratchet.baseline.json` nur mit `ratchet baseline init` (neue Regeln) bzw.
`ratchet baseline update` (echte Verbesserung) ändern. Die Testanzahl darf
nicht sinken. Jeder Commit braucht einen `Verify:`-Footer.

## Regeln dieser Ebene

Regeln dieser Ebene. Was nur ein Verzeichnis betrifft, gehört in die
`AGENTS.md` **dieses** Verzeichnisses — sie wird geladen, wenn eine Datei
daraus gelesen wird.

Ein Plan in `docs/plans/` beginnt mit `**Status:** Plan | In Arbeit | Done |
Empfehlung, nicht implementiert`.

Jede Quelldatei max. 400 Zeilen (Gate `file-max-lines`, `check-file-lines.sh`);
`AGENTS.md` bleibt als stets geladene Datei unter 100 Zeilen (Gate
`rule-file-max-lines`).

## Tracker

Offene Arbeit als GitHub-Issue, nicht lokal. Commits verlinken mit
`Closes #N` bzw. `Refs #N`.

## Commits

Conventional Commits, z. B. `feat: …`, `fix: …`, `chore: …`.

## Daten

- `containedIn`: freie Notiz pro Zeile, kein Fremdschlüssel.
- Nicht deduplizieren/joinen; doppelte Nummern (219) bleiben erhalten.
- Sonderserien: eigene Liste, eigener Nummernkreis.
- Sync-Scripts schreiben bei Fehlern keine leeren/erfundenen JSONs — erst
  nach erfolgreichen Abrufen.

## Cover

Nur verlinken, nie herunterladen oder einchecken. Rechte: Disney/Egmont.
