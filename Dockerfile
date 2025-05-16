FROM node:22

WORKDIR /fredy

COPY . /fredy

RUN apt-get update && apt-get install -y chromium

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN corepack enable && pnpm config set network-timeout 600000

RUN pnpm install

RUN pnpm add -g pm2

RUN pnpm run prod

RUN mkdir /db /conf && \
  chown 1000:1000 /db /conf && \
  chmod 777 -R /db/ && \
  ln -s /db /fredy/db && ln -s /conf /fredy/conf

EXPOSE 9998

CMD pm2-runtime index.js