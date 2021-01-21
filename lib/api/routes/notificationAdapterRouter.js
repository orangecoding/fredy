const fs = require('fs');
const service = require('restana')();
const notificationAdapterRouter = service.newRouter();

const notificationAdapterList = fs.readdirSync('./lib//notification/adapter').filter((file) => file.endsWith('.js'));

const notificationAdapter = notificationAdapterList.map((pro) => {
  return require(`../../notification/adapter/${pro}`);
});

notificationAdapterRouter.post('/try', async (req, res) => {
  const { id, fields } = req.body;
  const adapter = notificationAdapter.find((adapter) => adapter.config.id === id);
  if (adapter == null) {
    res.send(404);
  }
  const notificationConfig = [];
  const notificationObject = {};
  Object.keys(fields).forEach((key) => {
    notificationObject[key] = fields[key].value;
  });
  notificationConfig.push({
    ...notificationObject,
    enabled: true,
    id,
  });
  Promise.all(
    adapter.send({
      serviceName: 'TestCall',
      newListings: [
        {
          price: '42 €',
          title: 'This is a test listing',
          address: 'some address',
          size: '666 2m',
          link: 'https://www.orange-coding.net',
        },
      ],
      notificationConfig,
      jobKey: 'TestJob',
    })
  )
    .then(() => res.send())
    .catch((error) => {
      res.send(new Error(error));
    });
});

notificationAdapterRouter.get('/', async (req, res) => {
  res.body = notificationAdapter.map((adapter) => adapter.config);
  res.send();
});

exports.notificationAdapterRouter = notificationAdapterRouter;
