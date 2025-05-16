FROM node:22

WORKDIR /fredy

COPY . .

RUN apt-get update && \
    apt-get install -y chromium && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm install -g pnpm && \
    pnpm config set network-timeout 600000 && \
    pnpm install && \
    pnpm add -g pm2 && \
    pnpm run prod && \
    mkdir /db /conf && \
    chown 1000:1000 /db /conf && \
    chmod 777 -R /db/ && \
    ln -s /db /fredy/db && ln -s /conf /fredy/conf

EXPOSE 9998

CMD ["pm2-runtime", "index.js"]
