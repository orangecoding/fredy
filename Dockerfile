FROM node:22-slim

# System deps for Chrome for Testing + build tools for native modules (better-sqlite3)
# Must run as root
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates fonts-liberation libasound2 \
    libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 xdg-utils \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /db /conf /fredy \
  && chown node:node /db /conf /fredy

WORKDIR /fredy

# Everything from here runs as the built-in non-root node user (UID 1000)
USER node

ENV NODE_ENV=production \
    IS_DOCKER=true

COPY --chown=node:node package.json yarn.lock ./

# Install dependencies and purge build tools (only needed to compile better-sqlite3)
RUN yarn config set network-timeout 600000 \
  && yarn --frozen-lockfile \
  && yarn cache clean

# Install Chrome for Testing in a separate layer — it's ~150MB and rarely changes,
# so keeping it separate avoids re-downloading on every code/dependency change
RUN npx puppeteer browsers install chrome

# Purge build tools now that native modules are compiled
USER root
RUN apt-get purge -y python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
USER node

COPY --chown=node:node index.html vite.config.js ./
COPY --chown=node:node ui ./ui
COPY --chown=node:node lib ./lib

RUN yarn build:frontend

COPY --chown=node:node index.js ./

RUN ln -s /db /fredy/db \
  && ln -s /conf /fredy/conf

EXPOSE 9998
VOLUME /db
VOLUME /conf

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:9998/ || exit 1

CMD ["node", "index.js"]
