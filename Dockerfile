FROM node:22-slim

WORKDIR /fredy

# Install Chromium without extra recommended packages and clean apt cache
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy lockfiles first to leverage cache for dependencies
COPY package.json yarn.lock .

# Set Yarn timeout, install dependencies and PM2 globally
RUN yarn config set network-timeout 600000 \
  && yarn --frozen-lockfile \
  && yarn global add pm2

# Copy application source and build production assets
COPY . .
RUN yarn build:frontend

# Prepare runtime directories and symlinks for data and config
RUN mkdir -p /db /conf \
  && chown 1000:1000 /db /conf \
  && chmod 777 /db /conf \
  && ln -s /db /fredy/db \
  && ln -s /conf /fredy/conf

EXPOSE 9998

# Start application using PM2 runtime
CMD ["pm2-runtime", "index.js"]
