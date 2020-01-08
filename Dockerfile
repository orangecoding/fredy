FROM alpine:latest

RUN mkdir -p /usr/src/

RUN apk add --update nodejs npm git

RUN cd /usr/src && git clone https://github.com/orangecoding/fredy.git

RUN ln -s /usr/src/fredy/conf/ /conf

RUN cd /usr/src/fredy/ && npm install

WORKDIR  /usr/src/fredy

EXPOSE 9876

VOLUME [ "/conf" ]

CMD node index.js --no-daemon