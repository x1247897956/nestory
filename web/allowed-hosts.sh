#!/bin/sh
# Map exact host names only; never interpolate arbitrary configuration syntax.
set -eu
: "${APP_ALLOWED_HOSTS:?APP_ALLOWED_HOSTS must not be empty}"
: > /tmp/allowed-hosts.conf
old_ifs=$IFS
IFS=,
set -f
for host in $APP_ALLOWED_HOSTS; do
 host=$(printf '%s' "$host" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
 case "$host" in ''|*[!a-zA-Z0-9._:-]*) echo 'Invalid APP_ALLOWED_HOSTS entry' >&2; exit 1;; esac
 host=${host%.}
 printf '"%s" 1;\n' "$host" >> /tmp/allowed-hosts.conf
 case "$host" in *:*) printf '"[%s]" 1;\n' "$host" >> /tmp/allowed-hosts.conf;; esac
done
IFS=$old_ifs
