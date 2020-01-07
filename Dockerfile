FROM node:10
# Create app directory

WORKDIR /

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 9876

VOLUME [ "/conf" ]

CMD node /index.js --no-daemon