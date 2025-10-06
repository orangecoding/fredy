#!/bin/sh
set -e

# Stop and remove old container if it exists
if [ "$(docker ps -aq -f name=fredy)" ]; then
  docker stop fredy || true
  docker rm fredy || true
fi

# Build image from local Dockerfile, forcing a fresh build without cache
docker build --no-cache -t fredy:local .

# Run container with volumes and port mapping
docker run -d --name fredy \
  -v fredy_conf:/conf \
  -v fredy_db:/db \
  -p 9998:9998 \
  fredy:local