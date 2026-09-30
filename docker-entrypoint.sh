#!/bin/sh
# Fredy startup script
# Runs node under tini instead of as pid 1, and as the unprivileged node user.
#
# Chromium spawns helper processes (crashpad handler, gpu, and - because of --no-zygote - one
# process per renderer). Whenever the browser process dies before them, e.g. when a page crashes
# it or Puppeteer has to kill it, those helpers are reparented to pid 1. libuv only waits for the
# pids node itself spawned, so a node running as pid 1 never reaps them and every failed scrape
# left two more `[chrome] <defunct>` entries behind until the container hit the pid limit.
# tini reaps whatever it inherits and forwards signals (-g: to the whole process group), so
# shutdown keeps working as before.
#
# Started as root (the default), it hands the volumes to node and drops privileges. Started with
# `--user`, it cannot fix anything, so it refuses to start when the volumes are not writable instead
# of letting SQLite fail later with a less helpful error.

set -e

uid="$(id -u)"
gid="$(id -g)"

if [ "$uid" = "0" ]; then
  # Only touches what is not node's already. -h: a symlink in a volume must not hand its target
  # to node.
  find /db /conf \( \! -user node -o \! -group node \) -exec chown -h node:node {} + \
    || echo "WARN: could not fix ownership of /db or /conf" >&2
  # setpriv keeps root's environment, so HOME would still point at /root. Chromium's profile and
  # CloakBrowser's binary cache both live under HOME.
  export HOME=/home/node
  exec setpriv --reuid=node --regid=node --init-groups /usr/bin/tini -g -- "$@"
fi

unwritable="$(find /db /conf \! -writable 2>/dev/null | head -n 5)"
if [ -n "$unwritable" ]; then
  echo "ERROR: running as uid $uid:$gid, but these paths in /db or /conf are not writable:" >&2
  echo "$unwritable" | sed 's/^/  /' >&2
  echo "Fix the ownership on the host, e.g. 'chown -R 1000:1000 <your db dir> <your conf dir>'," >&2
  echo "or start the container without --user to let it fix the ownership itself." >&2
  exit 1
fi

exec /usr/bin/tini -g -- "$@"
