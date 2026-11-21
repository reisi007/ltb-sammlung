#!/usr/bin/env bash
# =============================================================================
# deploy.sh — statischen Prototyp auf ltb.all-the.rest spiegeln
# =============================================================================
# Das Ziel ist der Host-Pfad /home/webadmin/websites/ltb.all-the.rest, der im
# proxy-stack read-only unter /srv/websites/ltb.all-the.rest gemountet wird.
# Auth übernimmt Caddy (basic_auth mit dem Hash von code.all-the.rest).
set -euo pipefail
cd "$(dirname "$0")"

# --- GNU-rsync-Pflicht (macOS-Default ist openrsync) -------------------------
RSYNC_BIN="${RSYNC_BIN:-$(command -v rsync || true)}"
_rsync_version="$("$RSYNC_BIN" --version 2>/dev/null | head -1 || true)"
if [[ "$_rsync_version" != "rsync  version"* ]]; then
  echo "FEHLER: GNU-rsync benoetigt (macOS-Default ist openrsync)." >&2
  echo "       Install: brew install rsync" >&2
  echo "       Oder:     RSYNC_BIN=/opt/homebrew/bin/rsync ./deploy.sh" >&2
  exit 1
fi
unset _rsync_version

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

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run: kein Build, kein Upload. Geplante Schritte:"
  echo "  BASE_PATH=/ npm run build"
  echo "  ssh root@reisinger.pictures 'mkdir -p ... && chown 1002:webgroup ...'"
  echo "  rsync -a --delete ./dist/ -> $REMOTE"
  exit 0
fi

echo "Baue Prototyp mit BASE_PATH=/ ..."
BASE_PATH=/ npm run build

echo "Bereite Zielverzeichnis auf dem Host vor ..."
ssh $SSH_OPTS -T root@reisinger.pictures \
  "mkdir -p /home/webadmin/websites/ltb.all-the.rest && chown 1002:webgroup /home/webadmin/websites/ltb.all-the.rest && chmod 2777 /home/webadmin/websites/ltb.all-the.rest"

echo "Spiegle dist/ nach $REMOTE ..."
"$RSYNC_BIN" ./dist/ "$REMOTE" \
  --archive \
  --delete \
  --chown=1002:webgroup \
  --chmod=D2777,F666 \
  --info=progress2 \
  --rsh="ssh $SSH_OPTS"

echo "Deploy abgeschlossen: https://ltb.all-the.rest/"
