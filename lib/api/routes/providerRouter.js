const fs = require('fs');
const service = require('restana')();
const providerRouter = service.newRouter();

const providerList = fs.readdirSync('./lib/provider').filter((file) => file.endsWith('.js'));

const provider = providerList.map((pro) => {
  return require(`../../provider/${pro}`).metaInformation;
});

providerRouter.get('/', async (req, res) => {
  res.body = provider;
  res.send();
});

exports.providerRouter = providerRouter;
