const bodyParser = require('body-parser');
const config = require('../../conf/config');
const { getLastJobExecution, getLastProviderExecution, getTotalNumberOfListings } = require('../services/store');
const PORT = config.infoApiPort || 9998;
const service = require('restana')();
const enabled = config.infoApi == null ? false : config.infoApi;

service.use(bodyParser.json());

service.get('/', async (req, res) => {
  const result = {};
  Object.keys(config.jobs).forEach((job) => {
    result[job] = {
      lastExecution: getLastJobExecution(job),
      enabledProvider: Object.keys(config.jobs[job].provider)
        .filter((providerKey) => config.jobs[job].provider[providerKey].enabled)
        .map((providerKey) => {
          return {
            name: providerKey,
            lastExecution: getLastProviderExecution(job, providerKey),
            totalFindings: getTotalNumberOfListings(job, providerKey),
          };
        }),
    };
  });
  res.body = result;
  res.send();
});

service.get('/jobs/:name', async (req, res) => {
  const { name: jobKey } = req.params;
  if (Object.keys(config.jobs).indexOf(jobKey) === -1) {
    console.error(`Cannot find job with name ${jobKey}. Available Jobs are [${Object.keys(config.jobs)}]`);
    res.send(404);
    return;
  }
  res.body = {
    lastExecution: getLastJobExecution(jobKey),
    enabledProvider: Object.keys(config.jobs[jobKey].provider)
      .filter((providerKey) => config.jobs[jobKey].provider[providerKey].enabled)
      .map((providerKey) => {
        return {
          name: providerKey,
          url: config.jobs[jobKey].provider[providerKey].url,
          lastExecution: getLastProviderExecution(jobKey, providerKey),
          totalFindings: getTotalNumberOfListings(jobKey, providerKey),
        };
      }),
  };
  res.send();
});

service.get('/ping', function (req, res) {
  res.body = {
    pong: 'pong',
  };
  res.send();
});

/* eslint-disable no-console */
if (enabled) {
  service.start(PORT).then(() => {
    console.info(`Started API service on port ${PORT}`);
  });
} else {
  console.info('Info Api is disabled.');
}
/* eslint-enable no-console */
