const config = require('../../conf/config.json');
let lastScrape = {};

if (config.enableStats) {
  const http = require('http');
  http
    .createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          config,
          lastScrape
        })
      );
    })
    .listen(config.statsPort, '127.0.0.1');
}

exports.setLastScrape = (serviceName, numberOfNewListsings) => {
  lastScrape[serviceName] = lastScrape[serviceName] || [];
  lastScrape[serviceName].push({
    scapeTime: new Date().toString(),
    listingsFound: numberOfNewListsings
  });
};
