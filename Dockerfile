FROM node:22-slim

WORKDIR /fredy

# Install Chromium and curl without extra recommended packages and clean apt cache
# curl is needed for the health check
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium curl \
  && rm -rf /var/lib/apt/lists/*

# Use predefined node user (UID 1000, GID 1000)
# Set home directory ownership for node user
RUN usermod -d /fredy node

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy lockfiles first to leverage cache for dependencies
COPY --chown=node:node package.json yarn.lock .

# Set Yarn timeout, install dependencies and PM2 globally
RUN yarn config set network-timeout 600000 \
  && yarn --frozen-lockfile \
  && yarn global add pm2

# Copy application source and build production assets
COPY --chown=node:node . .
RUN yarn build:frontend

# Prepare runtime directories and symlinks for data and config
RUN mkdir -p /db /conf \
  && chown -R node:node /fredy /db /conf \
  && chmod 755 /db /conf \
  && ln -s /db /fredy/db \
  && ln -s /conf /fredy/conf

EXPOSE 9998
VOLUME /db
VOLUME /conf

# Switch to non-root user
USER node

# Start application using PM2 runtime
CMD ["pm2-runtime", "index.js"]
