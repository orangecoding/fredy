# ================================
# Stage 1: Build stage
# ================================
FROM node:22-alpine AS builder

WORKDIR /build

# Install build dependencies needed for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files first for better layer caching
COPY package.json ./

# Install all dependencies (including devDependencies for building)
# Generate fresh lockfile for Linux platform to get correct native deps
RUN npm install

# Copy source files needed for build
COPY index.html vite.config.js ./
COPY ui ./ui
COPY lib ./lib

# Build frontend assets
RUN npm run build:frontend

# ================================
# Stage 2: Production stage
# ================================
FROM node:22-alpine

WORKDIR /fredy

# Install Chromium and curl (for healthcheck)
# Using Alpine's chromium package which is much smaller
RUN apk add --no-cache chromium curl

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install build dependencies for native modules, then remove them after npm install
COPY package.json ./

# HUSKY=0 disables husky's prepare script, allowing native modules to build
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && HUSKY=0 npm install --omit=dev \
  && npm cache clean --force \
  && apk del .build-deps

# Copy built frontend from builder stage
COPY --from=builder /build/ui/public ./ui/public

# Copy application source (only what's needed at runtime)
COPY index.js ./
COPY index.html ./
COPY lib ./lib

# Prepare runtime directories and symlinks for data and config
RUN mkdir -p /db /conf \
  && chown 1000:1000 /db /conf \
  && chmod 777 /db /conf \
  && ln -s /db /fredy/db \
  && ln -s /conf /fredy/conf

EXPOSE 9998

CMD ["node", "index.js"]
