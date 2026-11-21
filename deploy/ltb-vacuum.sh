#!/usr/bin/env bash
# =============================================================================
# ltb-vacuum.sh — konsistente SQLite-Sicherung der LTB-Sammlung
# =============================================================================
# Laeuft als Cronjob auf dem VPS (siehe deploy/README oder README.md):
#
#   23 3 * * * /usr/local/bin/ltb-vacuum.sh >> /var/log/ltb-vacuum.log 2>&1
#
# Jeder Lauf schreibt genau eine eigene Datei pro Projekt:
#   /var/backups/ltb/ltb-YYYY-MM-DD.sqlite.gz
# und laedt sie (wenn rclone verfuegbar ist) nach
#   pCloud:Backup/strato-v2/db/ltb/
#
# Die Datei entsteht per `VACUUM INTO` im Container, wird dort auf Integritaet
# geprueft und erst danach kopiert. Schlaegt irgendetwas fehl, bleibt die alte
# Sicherung unangetastet und es wird KEINE leere Datei geschrieben.
set -euo pipefail

CONTAINER="${LTB_CONTAINER:-ltb-php}"
BACKUP_DIR="${LTB_BACKUP_DIR:-/var/backups/ltb}"
KEEP_DAYS="${LTB_BACKUP_KEEP_DAYS:-14}"
REMOTE="${LTB_BACKUP_REMOTE:-pCloud:Backup/strato-v2/db/ltb}"
TMP_IN_CONTAINER="/data/ltb-vacuum-$$.sqlite"
STAMP="$(date +%F)"
TARGET="${BACKUP_DIR}/ltb-${STAMP}.sqlite"
TMP_LOCAL=""

cleanup() {
  docker exec "$CONTAINER" rm -f "$TMP_IN_CONTAINER" >/dev/null 2>&1 || true
  [[ -n "$TMP_LOCAL" ]] && rm -f "$TMP_LOCAL" "${TMP_LOCAL}.gz"
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
TMP_LOCAL="$(mktemp "${BACKUP_DIR}/.ltb-${STAMP}.XXXXXX")"

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -qx true; then
  echo "FEHLER: Container ${CONTAINER} laeuft nicht — keine Sicherung." >&2
  exit 1
fi

echo "[$(date -Is)] VACUUM in ${CONTAINER} ..."
docker exec "$CONTAINER" php /srv/api/bin/vacuum.php "$TMP_IN_CONTAINER"

# Erst in eine temporaere Datei kopieren, dann atomar umbenennen: ein
# abgebrochener Lauf hinterlaesst so nie eine halbe Sicherung.
docker cp "${CONTAINER}:${TMP_IN_CONTAINER}" "$TMP_LOCAL"
gzip -9 -c "$TMP_LOCAL" > "${TMP_LOCAL}.gz"
gzip -t "${TMP_LOCAL}.gz"
if [[ ! -s "${TMP_LOCAL}.gz" ]]; then
  echo "FEHLER: Sicherung ist leer — keine Datei geschrieben." >&2
  exit 1
fi
mv "${TMP_LOCAL}.gz" "${TARGET}.gz"
chmod 600 "${TARGET}.gz"
echo "[$(date -Is)] Sicherung: ${TARGET}.gz ($(du -h "${TARGET}.gz" | cut -f1))"

# Retention vor dem Upload: lokale Sicherungen sammeln sich auch dann nicht
# unbegrenzt, wenn rclone fehlt oder der Upload scheitert.
find "$BACKUP_DIR" -maxdepth 1 -name 'ltb-*.sqlite.gz' -type f \
  -mtime "+${KEEP_DAYS}" -delete

if [[ -n "$REMOTE" ]]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "FEHLER: rclone fehlt, Offsite-Upload nach ${REMOTE} nicht moeglich." >&2
    echo "        Lokale Sicherung liegt unter ${TARGET}.gz." >&2
    exit 1
  fi
  if rclone copyto "${TARGET}.gz" "${REMOTE}/$(basename "${TARGET}.gz")"; then
    echo "[$(date -Is)] Upload ok: ${REMOTE}/$(basename "${TARGET}.gz")"
    rclone delete "$REMOTE" --min-age "${KEEP_DAYS}d" --include '*.sqlite.gz' >/dev/null 2>&1 || true
  else
    echo "WARNUNG: Upload nach ${REMOTE} fehlgeschlagen; lokale Sicherung bleibt erhalten." >&2
    exit 1
  fi
fi

echo "[$(date -Is)] Fertig. Lokale Dateien: $(find "$BACKUP_DIR" -maxdepth 1 -name 'ltb-*.sqlite.gz' | wc -l | tr -d ' ')"
