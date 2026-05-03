#!/bin/sh
set -e

# Stop and remove old container if it exists
if [ "$(docker ps -aq -f name=fredy)" ]; then
  docker stop fredy || true
  docker rm fredy || true
fi

# On Apple Silicon, force linux/amd64 to match production CI and avoid arm64/x86_64
# Chrome mismatch under Rosetta. On native Linux (amd64 or arm64) let Docker pick naturally. That took me fucking 1 hour to figure out.
PLATFORM=""
if [ "$(uname -m)" = "arm64" ] && [ "$(uname -s)" = "Darwin" ]; then
  PLATFORM="linux/amd64"
fi

# Build image from local Dockerfile, forcing a fresh build without cache
if [ -n "$PLATFORM" ]; then
  docker build --no-cache --platform "$PLATFORM" -t fredy:local .
else
  docker build --no-cache -t fredy:local .
fi

# Run container with volumes and port mapping
if [ -n "$PLATFORM" ]; then
  docker run -d --name fredy --platform "$PLATFORM" -v fredy_conf:/conf -v fredy_db:/db -p 9998:9998 fredy:local
else
  docker run -d --name fredy -v fredy_conf:/conf -v fredy_db:/db -p 9998:9998 fredy:local
fi

echo "Waiting for app to be ready..."
for i in $(seq 1 30); do
  if docker exec fredy curl -sf http://localhost:9998/ > /dev/null 2>&1; then
    echo "App is up"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "App did not come up in time"
    docker logs fredy
    exit 1
  fi
  sleep 2
done

# Verify the DB is readable/writable via the API.
# /api/demo is unauthenticated and reads the settings table - if SQLite is broken this returns an error.
echo "Testing DB via API (/api/demo)..."
DEMO_RESPONSE=$(docker exec fredy curl -sf http://localhost:9998/api/demo 2>&1)
if echo "$DEMO_RESPONSE" | grep -q "demoMode"; then
  echo "DB is readable (got demoMode from /api/demo)"
else
  echo "DB check failed - unexpected response from /api/demo: $DEMO_RESPONSE"
  docker logs fredy
  exit 1
fi

# Verify Chrome launches without crashing.
# On amd64: Chrome for Testing lives in the puppeteer cache.
# On arm64: system Chromium is used instead.
echo "Testing Chrome..."
CHROME=$(docker exec fredy find /root/.cache/puppeteer /home -name chrome -type f 2>/dev/null | head -1)
if [ -z "$CHROME" ]; then
  CHROME=$(docker exec fredy which chromium 2>/dev/null || true)
fi
if [ -z "$CHROME" ]; then
  echo "Chrome/Chromium binary not found"
  exit 1
fi
if docker exec fredy "$CHROME" --headless --no-sandbox --disable-gpu --dump-dom https://example.com 2>&1 | grep -q "<html"; then
  echo "Chrome works"
else
  echo "Chrome failed to render a page"
  docker exec fredy "$CHROME" --headless --no-sandbox --disable-gpu --dump-dom https://example.com 2>&1 | head -20
  exit 1
fi

echo ""
echo "All checks passed."
