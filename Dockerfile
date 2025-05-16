FROM node:22

WORKDIR /fredy

RUN corepack enable \
 && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN apt-get update \
 && apt-get install -y chromium \
 && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN pnpm add -g pm2 \
 && pnpm config set network-timeout 600000 \
 && pnpm run prod \
 && mkdir -p /db /conf \
 && chown 1000:1000 /db /conf \
 && chmod 777 /db /conf \
 && ln -s /db /fredy/db \
 && ln -s /conf /fredy/conf

EXPOSE 9998

CMD ["pm2-runtime", "index.js"]
