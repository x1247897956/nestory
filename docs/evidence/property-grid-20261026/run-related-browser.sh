#!/bin/sh
# Opt-in release regression checks, never the user's running instance.
set -eu
if [ "$#" -ne 1 ]; then echo 'Usage: sh scripts/audit/run_browser.sh IMAGE' >&2; exit 2; fi
image=$1
name=noteapp-release-audit-$(date +%s)-$$
made_container=0
made_volume=0
cleanup() {
 if [ "$made_container" = 1 ]; then docker rm -f "$name" >/dev/null; fi
 if [ "$made_volume" = 1 ]; then docker volume rm "$name" >/dev/null; fi
}
trap cleanup EXIT HUP INT TERM
docker volume create "$name" >/dev/null
made_volume=1
docker create -e APP_ALLOWED_HOSTS=localhost,127.0.0.1,::1,lan.noteapp.test --name "$name" -p 127.0.0.1:18187:8080 -v "$name:/data" "$image" >/dev/null
made_container=1
docker start "$name" >/dev/null
attempt=0
until curl -fsS http://127.0.0.1:18187/api/v1/readyz >/dev/null; do
 attempt=$((attempt + 1)); [ "$attempt" -lt 50 ] || exit 1
 sleep .1
done
NOTEAPP_RELEASE_AUDIT=1 NOTEAPP_AUDIT_CONTAINER="$name" E2E_BASE_URL=http://127.0.0.1:18187 npm run e2e --prefix web -- e2e/property-grid-header.spec.ts e2e/property-controls.spec.ts e2e/overview-layout.spec.ts e2e/object-dialog-options.spec.ts e2e/object-properties.spec.ts e2e/workspace-design.spec.ts
