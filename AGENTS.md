# AGENTS.md

## Was „grün“ bedeutet

Ein Beitrag ist grün, wenn beide Befehle ohne Fehler durchlaufen:

```bash
npm run verify           # typecheck + Tests + Build
ratchet check --no-ratchet
```

`npm run verify` führt `tsc --noEmit`, `vitest run` und `vite build` aus.
`ratchet check --no-ratchet` prüft die Gates aus `ratchet.config.jsonc`, ohne
die Baseline zu verändern. Die Baseline `ratchet.baseline.json` wird nur mit
`ratchet baseline init` (neue Regeln) bzw. `ratchet baseline update` (echte
Verbesserung) angepasst.

Die Gates zählen unter anderem `TODO`, `any`, `console.log` und
TypeScript-Fehler in `src/` und `scripts/`. Neue Tests sind willkommen; die
Testanzahl darf nicht sinken.

## Tracker

Offene Arbeit steht als GitHub-Issue im Repository, nicht in lokalen
Aufgabenlisten. Commits verlinken ihr Issue: `Closes #N` beim Abschluss, sonst
`Refs #N`.

## Commits

Conventional Commits verwenden, z. B.:

```text
feat: add QR placeholder to search bar
fix: keep duplicate collection rows
chore: sync cover catalog
```

## Datenregeln

- `containedIn` ist eine freie Notiz pro Sammlungszeile, kein Fremdschlüssel.
- Zeilen nicht deduplizieren und nicht joinen. Doppelte Nummern (z. B. 219)
  bleiben erhalten.
- Sonderserien sind eine getrennte Liste mit eigenen Nummernkreisen.
- Die Sync-Scripts dürfen bei Fehlern keine leeren oder erfundenen JSON-Dateien
  schreiben. Erst schreiben, wenn alle Abrufe erfolgreich waren.

## Cover

Cover nur verlinken, nie herunterladen oder ins Repository legen. Die Rechte
liegen bei Disney/Egmont und den jeweiligen Rechteinhabern.
