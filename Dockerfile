FROM alpine:latest

WORKDIR  /usr/src/

RUN cd /usr/src/

RUN apk add --update nodejs npm git

RUN git clone https://github.com/orangecoding/fredy.git

RUN ln -s /usr/src/fredy/conf/ /conf

RUN cd /usr/src/fredy/ && npm install

EXPOSE 9876

VOLUME [ "/conf" ]

CMD node /index.js --no-daemon