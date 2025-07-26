import restana from 'restana';
import notificationAdapters from '../../notification/adapter/index.js';

const service = restana();
const notificationAdapterRouter = service.newRouter();

notificationAdapterRouter.post('/try', async (req, res) => {
  const { id, fields } = req.body;
  const adapter = notificationAdapters.find((adapter) => adapter.config.id === id);
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
  res.body = notificationAdapters.map((adapter) => adapter.config);
  res.send();
});
export { notificationAdapterRouter };
