FROM alpine:latest

RUN mkdir -p /usr/src/
#Install Software
RUN apk add --update nodejs npm git

RUN cd /usr/src && git clone https://github.com/orangecoding/fredy.git

RUN ln -s /usr/src/fredy/conf/ /conf

# create db folder
RUN mkdir /usr/src/fredy/db/

RUN ln -s /usr/src/fredy/db/ /db

RUN cd /usr/src/fredy/ && npm install

WORKDIR  /usr/src/fredy

EXPOSE 9998

VOLUME [ "/conf", "/db" ]
# --no-daemon is required for keeping Container alive
CMD node index.js --no-daemon 
