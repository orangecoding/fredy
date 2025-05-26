# Stage 1: build
FROM node:22-slim AS builder

WORKDIR /fredy

# Install Chromium without extra recommended packages and clean apt cache
RUN apt-get update && apt-get install -y --no-install-recommends chromium \
 && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy manifest for better cache usage
COPY package.json yarn.lock ./

# Increase yarn timeout, install deps and pm2 globally
RUN yarn config set network-timeout 600000 \
 && yarn install --frozen-lockfile \
 && yarn global add pm2

# Copy app sources and build production assets
COPY . .
RUN yarn run prod

# Stage 2: runtime
FROM node:22-slim AS runner

WORKDIR /fredy

# Copy entire build directory from builder instead of individual folders
COPY --from=builder /fredy /fredy
# Copy Chromium executable
COPY --from=builder /usr/bin/chromium /usr/bin/chromium

# Create non-root user, prepare volumes and permissions
RUN groupadd -r app && useradd -r -g app app \
 && mkdir /db /conf \
 && chown app:app /db /conf \
 && chmod 777 /db /conf

USER app

EXPOSE 9998

# Run with pm2-runtime for proper process management
CMD ["pm2-runtime", "index.js"]