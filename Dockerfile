FROM node:22 AS builder

WORKDIR /fredy

RUN corepack enable \
 && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run prod

FROM node:22-slim

WORKDIR /fredy

RUN apt-get update \
 && apt-get install -y chromium \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
 && corepack prepare pnpm@latest --activate \
 && pnpm add -g pm2

COPY --from=builder /fredy/node_modules ./node_modules
COPY --from=builder /fredy/dist ./dist
COPY --from=builder /fredy/package.json ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN mkdir -p /db /conf \
 && chown 1000:1000 /db /conf \
 && chmod 777 /db /conf \
 && ln -s /db /fredy/db \
 && ln -s /conf /fredy/conf

EXPOSE 9998

CMD ["pm2-runtime", "dist/index.js"]
