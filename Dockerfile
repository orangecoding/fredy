# syntax=docker/dockerfile:1.3
FROM node:16-alpine AS builder
COPY --chown=1000:1000 . /fredy
WORKDIR  /fredy
USER 1000
RUN yarn install
RUN yarn run prod

FROM node:16-alpine
COPY --from=builder --chown=1000:1000 /fredy /fredy
RUN mkdir /db /conf && \
  chown 1000:1000 /db /conf && \
  ln -s /db /fredy/db && ln -s /conf /fredy/conf
EXPOSE 9998
USER 1000
VOLUME [ "/conf", "/db" ]
WORKDIR  /fredy
CMD node index.js --no-daemon
