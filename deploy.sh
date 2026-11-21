#!/usr/bin/env bash
# =============================================================================
# deploy.sh — statischen Prototyp auf ltb.all-the.rest spiegeln
# =============================================================================
# Das Ziel ist der Host-Pfad /home/webadmin/websites/ltb.all-the.rest, der im
# proxy-stack read-only unter /srv/websites/ltb.all-the.rest gemountet wird.
# Auth übernimmt Caddy (forward_auth gegen den code-auth-Sidecar).
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="root@reisinger.pictures:/home/webadmin/websites/ltb.all-the.rest/"
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
  echo "  3. ssh root@reisinger.pictures 'mkdir -p …/ltb.all-the.rest'"
  echo "  4. rsync ${RSYNC_FLAGS[*]} ./dist/ $REMOTE"
  echo "  5. curl -o /dev/null -w '%{http_code}' https://ltb.all-the.rest/ (erwartet 302 auf /login.html)"
  exit 0
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

echo "Bereite Zielverzeichnis auf dem Host vor ..."
ssh $SSH_OPTS -T root@reisinger.pictures \
  "mkdir -p /home/webadmin/websites/ltb.all-the.rest && chown 1002:webgroup /home/webadmin/websites/ltb.all-the.rest && chmod 2755 /home/webadmin/websites/ltb.all-the.rest"

echo "Spiegle dist/ nach $REMOTE ..."
"$RSYNC_BIN" ./dist/ "$REMOTE" "${RSYNC_FLAGS[@]}" --rsh="ssh $SSH_OPTS"

echo "Pruefe, ob die Seite antwortet (ohne Cookie erwartet: 302 auf /login.html) ..."
response="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 https://ltb.all-the.rest/ || true)"
read -r status location <<< "$response" || true
if [[ "$status" != "302" || "$location" != "https://ltb.all-the.rest/login.html" ]]; then
  echo "FEHLER: https://ltb.all-the.rest/ antwortet mit HTTP ${status:-keine Antwort} (Ziel: ${location:-keins})." >&2
  echo "        Erwartet wird 302 auf /login.html; alles andere heisst: Auth ist offen." >&2
  exit 1
fi
echo "HTTP $status -> $location"

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

echo "Deploy abgeschlossen: https://ltb.all-the.rest/"
