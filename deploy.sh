#!/usr/bin/env bash
# =============================================================================
# deploy.sh — statischen Prototyp auf ltb.all-the.rest spiegeln
# =============================================================================
# Das Ziel ist der Host-Pfad /home/webadmin/websites/ltb.all-the.rest, der im
# proxy-stack read-only unter /srv/websites/ltb.all-the.rest gemountet wird.
# Auth macht die PHP-API selbst (Benutzer + Sessions in SQLite). Caddy liefert
# nur statische Dateien und reicht /api/* per FastCGI an PHP weiter.
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="root@reisinger.pictures:/home/webadmin/websites/ltb.all-the.rest/"
API_REMOTE="root@reisinger.pictures:/home/webadmin/websites/ltb-api/"
SEED_REMOTE="root@reisinger.pictures:/home/webadmin/websites/ltb-seed/"
STACK_DIR="/opt/stacks/ltb"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=/tmp/ssh-sync-%r@%h:%p -o ControlPersist=60"

DRY_RUN=false
case "${1:-}" in
  "") ;;
  --dry-run) DRY_RUN=true ;;
  *)
    printf 'Usage: %s [--dry-run]\n' "$0" >&2
    exit 2
    ;;
esac

# --- GNU-rsync >= 3.1 (macOS-Default ist openrsync) --------------------------
RSYNC_BIN="${RSYNC_BIN:-$(command -v rsync || true)}"
_rsync_version="$("$RSYNC_BIN" --version 2>/dev/null | head -1 || true)"
_rsync_numbers="$(printf '%s\n' "$_rsync_version" | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)"
_rsync_major="${_rsync_numbers%%.*}"
_rsync_minor="${_rsync_numbers##*.}"
if [[ -z "$_rsync_numbers" ]] ||
  (( _rsync_major < 3 || (_rsync_major == 3 && _rsync_minor < 1) )); then
  echo "FEHLER: GNU-rsync >= 3.1 benoetigt (gefunden: ${_rsync_version:-unbekannt})." >&2
  echo "       Install: brew install rsync" >&2
  echo "       Oder:    RSYNC_BIN=/opt/homebrew/bin/rsync ./deploy.sh" >&2
  exit 1
fi
unset _rsync_version _rsync_numbers _rsync_major _rsync_minor

RSYNC_FLAGS=(
  --archive
  --delete
  --delete-after
  --delay-updates
  --chown=1002:webgroup
  --chmod=D2755,F644
  --info=progress2
)

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run: kein Upload, kein Remote-Zugriff. Geplante Schritte:"
  echo "  1. BASE_PATH=/ npm run build"
  echo "  2. Pruefung: dist/index.html nicht leer und mit /assets/-Pfaden"
  echo "  3. ssh root@reisinger.pictures 'mkdir -p …/ltb.all-the.rest …/ltb-api …/ltb-seed /opt/stacks/ltb'"
  echo "  4. rsync ${RSYNC_FLAGS[*]} ./dist/ $REMOTE"
  echo "  5. rsync ./api/ $API_REMOTE und src/data/collection.json nach $SEED_REMOTE"
  echo "  6. compose.yaml nach $STACK_DIR und 'docker compose up -d'"
  echo "  7. curl / (302 auf /login.html), /api/health (ok) und /api/collection (401)"
  echo "  8. Login ueber die API, danach muessen meta.source=sqlite und LTB-Zeilen vorhanden sein"
  exit 0
fi

if [[ -z "${LTB_USER:-}" || -z "${LTB_PASSWORD:-}" ]]; then
  echo "FEHLER: LTB_USER und LTB_PASSWORD sind Pflicht." >&2
  echo "        Der Deploy legt den Benutzer an und prueft die Datenbank." >&2
  exit 1
fi
if [[ ! "$LTB_USER" =~ ^[a-z0-9._-]{1,40}$ ]]; then
  echo "FEHLER: LTB_USER darf nur a-z, 0-9, Punkt, Unterstrich und Bindestrich enthalten." >&2
  exit 1
fi

echo "Pruefe, dass echte Daten vorhanden sind (keine Platzhalter) ..."
node scripts/ensure-data.mjs --check

echo "Baue Prototyp mit BASE_PATH=/ ..."
BASE_PATH=/ npm run build

for required in dist/index.html dist/login.html dist/sw.js dist/manifest.webmanifest; do
  if [[ ! -s "$required" ]]; then
    echo "FEHLER: $required fehlt oder ist leer — kein Deploy." >&2
    echo "        rsync --delete würde die Live-Datei entfernen." >&2
    exit 1
  fi
done

if grep -q 'src="/ltb-sammlung/' dist/index.html; then
  echo "FEHLER: dist/ wurde mit dem GitHub-Pages-Basispfad gebaut." >&2
  echo "        Erwartet werden Pfade wie src=\"/assets/…\"." >&2
  exit 1
fi

if ! grep -q 'src="/assets/' dist/index.html; then
  echo "FEHLER: dist/index.html referenziert keine /assets/-Datei — kein Deploy." >&2
  exit 1
fi

# Private Sammlungsdaten duerfen nie als oeffentliches Asset im Build landen:
# die App-Huelle ist ohne Login erreichbar, nur /api/* ist geschuetzt. Der
# Check ist formatunabhaengig (auch minifizierte/unquotierte Snapshots).
if ! node scripts/assert-no-collection-data.mjs dist; then
  echo "FEHLER: dist/ enthaelt Sammlungsdaten (Snapshot). Kein Deploy." >&2
  exit 1
fi

echo "Bereite Zielverzeichnisse auf dem Host vor ..."
ssh $SSH_OPTS -T root@reisinger.pictures \
  "mkdir -p /home/webadmin/websites/ltb.all-the.rest /home/webadmin/websites/ltb-api /home/webadmin/websites/ltb-seed $STACK_DIR &&
   chown 1002:webgroup /home/webadmin/websites/ltb.all-the.rest /home/webadmin/websites/ltb-api /home/webadmin/websites/ltb-seed &&
   chmod 2755 /home/webadmin/websites/ltb.all-the.rest /home/webadmin/websites/ltb-api /home/webadmin/websites/ltb-seed"

echo "Spiegle dist/ nach $REMOTE ..."
"$RSYNC_BIN" ./dist/ "$REMOTE" "${RSYNC_FLAGS[@]}" --rsh="ssh $SSH_OPTS"

echo "Spiegle die API nach $API_REMOTE ..."
"$RSYNC_BIN" ./api/ "$API_REMOTE" --archive --delete --delete-after \
  --chown=1002:webgroup --chmod=D2755,F644 --rsh="ssh $SSH_OPTS"

echo "Spiegle den Seed nach $SEED_REMOTE ..."
"$RSYNC_BIN" ./src/data/collection.json "$SEED_REMOTE" --archive \
  --chown=1002:webgroup --chmod=F644 --rsh="ssh $SSH_OPTS"

echo "Installiere den PHP-Stack und starte ihn ..."
"$RSYNC_BIN" ./deploy/ltb-stack/compose.yaml "root@reisinger.pictures:$STACK_DIR/compose.yaml" \
  --archive --chmod=F644 --rsh="ssh $SSH_OPTS"
ssh $SSH_OPTS -T root@reisinger.pictures \
  "cd $STACK_DIR && docker compose up -d --remove-orphans"

echo "Lege den Benutzer an, falls er noch fehlt ..."
users="$(ssh $SSH_OPTS -T root@reisinger.pictures \
  "docker exec -i ltb-php php /srv/api/bin/user.php list" 2>/dev/null || true)"
if ! printf '%s\n' "$users" | grep -Fxq "$LTB_USER"; then
  printf '%s\n' "$LTB_PASSWORD" | ssh $SSH_OPTS -T root@reisinger.pictures \
    "docker exec -i ltb-php php /srv/api/bin/user.php add $LTB_USER"
  echo "Benutzer $LTB_USER angelegt."
else
  echo "Benutzer $LTB_USER existiert bereits (Passwort bleibt unveraendert)."
fi

echo "Pruefe, ob die App-Huelle antwortet ..."
response="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://ltb.all-the.rest/ || true)"
if [[ "$response" != "200" ]]; then
  echo "FEHLER: https://ltb.all-the.rest/ antwortet mit HTTP ${response:-keine Antwort}." >&2
  exit 1
fi
echo "HTTP $response (App-Huelle; Daten bleiben hinter der API-Auth)"

# Die Login-Seite muss ohne Cookie ausgeliefert werden, inklusive ihres
# eigenen CSS/JS — sonst ist die Anmeldung fuer neue Besucher kaputt.
echo "Pruefe die Login-Seite ohne Cookie ..."
login_response="$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 15 https://ltb.all-the.rest/login.html || true)"
read -r login_status login_type <<< "$login_response" || true
if [[ "$login_status" != "200" || "$login_type" != text/html* ]]; then
  echo "FEHLER: /login.html antwortet mit HTTP ${login_status:-keine Antwort} (${login_type:-ohne Typ})." >&2
  exit 1
fi
echo "HTTP $login_status ($login_type)"

login_page="$(curl -s --max-time 15 https://ltb.all-the.rest/login.html || true)"
login_assets="$(printf '%s' "$login_page" | grep -oE '(/assets/[^"]+|/icon\.svg|/icons/[^"]+|/manifest\.webmanifest|/registerSW\.js)' | sort -u || true)"
if [[ -z "$login_assets" ]]; then
  echo "FEHLER: /login.html referenziert keine Assets." >&2
  exit 1
fi
while IFS= read -r asset; do
  asset_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://ltb.all-the.rest$asset" || true)"
  if [[ "$asset_status" != "200" ]]; then
    echo "FEHLER: Login-Asset $asset antwortet mit HTTP $asset_status statt 200." >&2
    echo "        Ohne Cookie waere die Login-Seite ungestylt und funktionslos." >&2
    exit 1
  fi
done <<< "$login_assets"
echo "Login-Assets ohne Cookie erreichbar: $(printf '%s\n' "$login_assets" | wc -l | tr -d ' ')"

echo "Pruefe die API ..."
health="$(curl -s --max-time 15 https://ltb.all-the.rest/api/health || true)"
if [[ "$health" != *'"status":"ok"'* ]]; then
  echo "FEHLER: /api/health antwortet nicht wie erwartet: ${health:-keine Antwort}" >&2
  exit 1
fi
collection_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://ltb.all-the.rest/api/collection || true)"
if [[ "$collection_status" != "401" ]]; then
  echo "FEHLER: /api/collection ohne Cookie antwortet mit HTTP $collection_status statt 401." >&2
  exit 1
fi
echo "API gesund, Sammlung ohne Cookie geschuetzt (401)"

cookie_jar="$(mktemp)"
trap 'rm -f "$cookie_jar"' EXIT
login_body="$(node -e '
console.log(JSON.stringify({ username: process.argv[1], password: process.argv[2] }));
' "$LTB_USER" "$LTB_PASSWORD")"
login_status="$(curl -s -o /dev/null -w '%{http_code}' -c "$cookie_jar" \
    -X POST -H 'content-type: application/json' \
    -d "$login_body" \
    https://ltb.all-the.rest/api/login || true)"
if [[ "$login_status" != "200" ]]; then
    echo "FEHLER: Login ueber die API antwortet mit HTTP $login_status." >&2
    exit 1
fi
collection_body="$(mktemp)"
read_status="$(curl -s -o "$collection_body" -w '%{http_code}' -b "$cookie_jar" \
    https://ltb.all-the.rest/api/collection || true)"
if [[ "$read_status" != "200" ]]; then
    echo "FEHLER: /api/collection mit Cookie antwortet mit HTTP $read_status." >&2
    rm -f "$collection_body"
    exit 1
fi

# Eine leere oder nicht geseedete Datenbank darf keinen gruenen Deploy geben.
# Bewusst mit node (ohnehin Voraussetzung) statt eines weiteren Tools.
ltb_rows="$(node -e '
const fs = require("node:fs");
const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const rows = data.meta?.source === "sqlite" ? data.ltb?.length ?? 0 : 0;
console.log(rows);
' "$collection_body" 2>/dev/null || echo 0)"
rm -f "$collection_body"

# Die Datenbank als Ganzes pruefen, nicht nur die Zeilen des Login-Benutzers:
# im Mehrbenutzerbetrieb darf ein neuer Benutzer leer starten, waehrend die
# Sammlung des Admins gefuellt ist.
db_rows="$(ssh $SSH_OPTS -T root@reisinger.pictures \
    "docker exec -i ltb-php php -r 'echo (int) (new PDO(\"sqlite:/data/ltb.sqlite\"))->query(\"SELECT COUNT(*) FROM rows\")->fetchColumn();'" \
    2>/dev/null || true)"
if [[ ! "${db_rows:-}" =~ ^[0-9]+$ ]]; then
    echo "FEHLER: Datenbankzaehlung fehlgeschlagen (Ausgabe: ${db_rows:-leer})." >&2
    exit 1
fi
if (( db_rows < 1 )); then
    echo "FEHLER: Die Datenbank enthaelt keine Zeilen (Quelle/Seed pruefen)." >&2
    exit 1
fi
echo "Login und Sammlung mit Cookie: HTTP 200, ${ltb_rows} LTB-Zeilen (DB gesamt: ${db_rows})"

echo "Deploy abgeschlossen: https://ltb.all-the.rest/"
