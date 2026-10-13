# Debian 13 (trixie, glibc 2.41) is required: since better-sqlite3 v13 the npm
# tarball ships prebuilt binaries, and prebuilds/linux-arm64.node is linked
# against GLIBC_2.38. Debian 12 (bookworm) only has glibc 2.36, so arm64
# containers crashed on startup with
# "libm.so.6: version `GLIBC_2.38' not found".
FROM node:22-trixie-slim

# System deps for CloakBrowser + build tools for native modules (better-sqlite3)
# NOTE: trixie renamed several libs as part of the 64-bit time_t transition
# (libasound2 -> libasound2t64 etc.) - keep the t64 suffixes.
# fonts-* packages below are CloakBrowser's recommended Linux font set
# (https://github.com/CloakHQ/cloakbrowser#font-setup-on-linux): sites like
# Kasada/Akamai render emoji/CJK glyphs on hidden canvases and hash the pixel
# output, so missing fonts produce hashes a minimal Linux image can't match.
# NOTE: Real Windows fonts (Segoe UI, Calibri, etc.) can't be bundled here since
# they require copying licensed files off an actual Windows install; the
# resulting CLOAKBROWSER_SUPPRESS_FONT_WARNING startup notice is expected.
# tini is the container's init (see ENTRYPOINT below) and must survive the build-tool purge.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates tini fonts-liberation libasound2t64 \
    libatk-bridge2.0-0t64 libatk1.0-0t64 libcups2t64 libdbus-1-3 \
    libdrm2 libgbm1 libgtk-3-0t64 libnspr4 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 xdg-utils \
    fonts-noto-color-emoji fonts-freefont-ttf fonts-unifont \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-tlwg-loma-otf \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /db /conf /fredy /home/node/.config /home/node/.cache \
  && chown -R node:node /fredy /db /conf /home/node

WORKDIR /fredy


ENV NODE_ENV=production \
    IS_DOCKER=true \
    CLOAKBROWSER_SUPPRESS_FONT_WARNING=1

COPY --chown=node:node package.json yarn.lock ./

USER node

# Install dependencies and purge build tools (only needed to compile better-sqlite3)
RUN yarn config set network-timeout 600000 \
  && yarn --frozen-lockfile \
  && yarn cache clean

# Fail the build (per architecture) instead of shipping an image whose native
# sqlite binding can't be dlopen'd on this base image's glibc
RUN node -e "const D = require('better-sqlite3'); new D(':memory:').close()"

# Pre-download the CloakBrowser stealth Chromium binary (supports x86_64 and arm64)
RUN node -e "import('cloakbrowser').then(({ensureBinary}) => ensureBinary())"

USER root

# Purge build tools now that native modules are compiled
RUN apt-get purge -y python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node index.html vite.config.js ./
# Static files Vite copies into the build as they are, such as the onboarding tour's pictures.
COPY --chown=node:node public ./public
COPY --chown=node:node ui ./ui
COPY --chown=node:node lib ./lib

USER node
RUN yarn build:frontend

COPY --chown=node:node index.js ./


USER root
RUN ln -s /db /fredy/db \
  && ln -s /conf /fredy/conf

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 9998
VOLUME /db
VOLUME /conf

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:9998/ || exit 1


ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "index.js"]
