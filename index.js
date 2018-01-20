require('rootpath')();
const fs = require('fs');
const path = './lib/provider';
const sources = fs.readdirSync(path);
const config = require('conf/config.json');
const stats = require('./lib/services/stats');

setInterval(
  (function exec() {
    sources.forEach(source => require(`${path}/${source}`).run(stats));
    return exec;
  })(),
  config.interval * 60 * 1000
);
