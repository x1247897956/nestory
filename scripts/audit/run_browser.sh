#!/bin/sh
# Opt-in regression against two disposable containers, never a deployed instance.
set -eu
if [ "$#" -ne 2 ]; then echo 'Usage: sh scripts/audit/run_browser.sh BACKEND_IMAGE FRONTEND_IMAGE' >&2; exit 2; fi
image=$1
frontend_image=$2
name=noteapp-release-audit-$(date +%s)-$$
front=$name-frontend
cleanup() {
 if [ "$?" -ne 0 ]; then docker logs --tail 100 "$name" 2>&1 || true; docker logs --tail 100 "$front" 2>&1 || true; fi
 docker rm -f "$front" "$name" >/dev/null 2>&1 || true
 docker network rm "$name" >/dev/null 2>&1 || true
 docker volume rm "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM
docker volume create "$name" >/dev/null
docker network create "$name" >/dev/null
docker run -d -e APP_ALLOWED_HOSTS=localhost,127.0.0.1,::1,lan.noteapp.test --name "$name" --network "$name" --network-alias noteapp -v "$name:/data" "$image" >/dev/null
docker run -d -e APP_ALLOWED_HOSTS=localhost,127.0.0.1,::1,lan.noteapp.test --name "$front" --network "$name" -p 127.0.0.1:18187:8080 "$frontend_image" >/dev/null
attempt=0
until curl -fsS http://127.0.0.1:18187/api/v1/readyz >/dev/null 2>&1; do
 attempt=$((attempt + 1))
 if [ "$attempt" -ge 150 ]; then docker logs "$name"; docker logs "$front"; exit 1; fi
 sleep .2
done
NOTEAPP_RELEASE_AUDIT=1 NOTEAPP_AUDIT_CONTAINER="$name" NOTEAPP_AUDIT_FRONTEND="$front" E2E_BASE_URL=http://127.0.0.1:18187 npm run e2e --prefix web
