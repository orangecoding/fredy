import fs from 'fs';
import restana from 'restana';
const service = restana();
const notificationAdapterRouter = service.newRouter();
const notificationAdapterList = fs.readdirSync('./lib//notification/adapter').filter((file) => file.endsWith('.js'));
const notificationAdapter = await Promise.all(
  notificationAdapterList.map(async (pro) => {
    return await import(`../../notification/adapter/${pro}`);
  })
);
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
    fields: { ...notificationObject },
    enabled: true,
    id,
  });
  try {
    await adapter.send({
      serviceName: 'TestCall',
      newListings: [
        {
          price: '42 €',
          title: 'This is a test listing',
          address: 'some address',
          size: '666 2m',
          link: 'https://www.orange-coding.net',
        },
        {
          price: '1500 €',
          title:
            'This is a test listing with long and doubled title. This is a test listing with long and doubled title.',
          address: 'some address',
          size: '777 2m',
          link: 'https://www.orange-coding.net',
        },
        {
          price: '2500 €',
          title: 'This is a test listing with an image',
          address: 'some address',
          size: '555 2m',
          link: 'https://www.orange-coding.net',
          image: 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg',
        },
      ],
      notificationConfig,
      jobKey: 'TestJob',
    });
    res.send();
  } catch (Exception) {
    res.send(new Error(Exception));
  }
});
notificationAdapterRouter.get('/', async (req, res) => {
  res.body = notificationAdapter.map((adapter) => adapter.config);
  res.send();
});
export { notificationAdapterRouter };
