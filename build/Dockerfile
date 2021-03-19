FROM alpine:latest AS build
# use given repository, default below:
ARG repo=https://github.com/orangecoding/fredy.git

RUN mkdir -p /usr/src/
#Install Software
RUN apk add --update nodejs npm git

# Output used repository
RUN echo "Cloning from $repo"

RUN cd /usr/src && git clone $repo

RUN ln -s /usr/src/fredy/conf/ /conf

# create db folder
RUN mkdir /usr/src/fredy/db/

RUN ln -s /usr/src/fredy/db/ /db

RUN npm i -g yarn

RUN cd /usr/src/fredy/ && yarn

WORKDIR  /usr/src/fredy

RUN yarn run prod

EXPOSE 9998

VOLUME [ "/conf", "/db" ]
# --no-daemon is required for keeping Container alive
CMD node index.js --no-daemon
