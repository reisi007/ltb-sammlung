#!/bin/sh
# Druckt die groesste Zeilenzahl aller Quelldateien (Ratchet-Gate: hartes Limit 400).
# Daten-, Lock- und generierte Dateien sind keine Quelldateien.
set -eu
cd "${1:-.}"

max=$(
  find . \
    \( -path ./node_modules -o -path ./.git -o -path ./dist \
       -o -path ./test-results -o -path ./.codegraph \) -prune -o \
    -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \
              -o -name '*.php' -o -name '*.sh' -o -name '*.yml' -o -name '*.yaml' \
              -o -name '*.jsonc' -o -name '*.md' -o -name 'Caddyfile' \
              -o -name 'Dockerfile' \) \
    -not -name 'package-lock.json' -print0 |
    xargs -0 wc -l |
    awk '$2 != "total" && $1 ~ /^[0-9]+$/ { print $1 }' |
    sort -rn |
    head -1
)

printf '%s\n' "${max:-0}"
