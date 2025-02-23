import fs from 'fs';
import restana from 'restana';
const service = restana();
const notificationAdapterRouter = service.newRouter();
const notificationAdapterList = fs.readdirSync('./lib//notification/adapter').filter((file) => file.endsWith('.js'));
// @ts-expect-error TS(1378): Top-level 'await' expressions are only allowed whe... Remove this comment to see the full error message
const notificationAdapter = await Promise.all(
  notificationAdapterList.map(async (pro) => {
    return await import(`../../notification/adapter/${pro}`);
  })
);
notificationAdapterRouter.post('/try', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'id' does not exist on type 'Body | undef... Remove this comment to see the full error message
  const { id, fields } = req.body;
  const adapter = notificationAdapter.find((adapter) => adapter.config.id === id);
  if (adapter == null) {
    res.send(404);
  }
  const notificationConfig = [];
  const notificationObject = {};
  Object.keys(fields).forEach((key) => {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
    res.send(new Error(Exception));
  }
});
notificationAdapterRouter.get('/', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
  res.body = notificationAdapter.map((adapter) => adapter.config);
  res.send();
});
export { notificationAdapterRouter };
