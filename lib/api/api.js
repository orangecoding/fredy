const bodyParser = require('body-parser');
const config = require('../../conf/config');

const PORT = 9988;
const service = require('restana')();
service.use(bodyParser.json());

service.get('/jobs', async (req, res) => {
  res.body = Object.keys(config.jobs);
  res.send();
});

service.get('/jobs/:name', async (req, res) => {
  res.body = 'TO BE IMPLEMENTED';
  res.send();
});

service.get('/jobs/:name/stats', async (req, res) => {
  res.body = 'TO BE IMPLEMENTED';
  res.send();
  //req.params.id
});

service.get('/ping', function(req, res) {
  // optionally you can send the response data in the body property
  res.body = {
    pong: 'pong'
  };
  res.send();
});

service.start(PORT).then(() => {
  /* eslint-disable no-console */
  console.info(`Started API service on port ${PORT}`);
  /* eslint-enable no-console */
});
