const config = require('../../conf/config.json');
let stats = {
    lastScrape: {},
    foundScrapes: {}
};

if (config.enableStats) {
    const http = require('http');
    http
        .createServer((req, res) => {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(
                JSON.stringify({
                    config,
                    stats
                })
            );
        })
        .listen(config.statsPort, '127.0.0.1');
}

const datetime = date => {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
};

exports.setLastScrape = (serviceName, numberOfNewListsings) => {
    const d = new Date();
    const dt = datetime(d);
    stats.lastScrape[serviceName] = d.toString();

    if (numberOfNewListsings > 0) {
        stats.foundScrapes[dt] = stats.foundScrapes[dt] || {};
        stats.foundScrapes[dt][serviceName] = numberOfNewListsings;
    }
};

