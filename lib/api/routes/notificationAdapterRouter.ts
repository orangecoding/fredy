import fs from 'fs';
import restana from 'restana';
const service = restana();

const notificationAdapterRouter = service.newRouter();
import {
  NotificationAdapterConfig,
  NotificationAdapterExport,
  NotificationAdapterFields,
} from '#types/NotificationAdapter.js';
import { Listing } from '#types/Listings.js';
import { HTTPError } from '../errorHandling';

const notificationAdapterList = fs.readdirSync('./lib//notification/adapter').filter((file) => file.endsWith('.ts')); // Filter for .ts files

const notificationAdapter: NotificationAdapterExport[] = await Promise.all(
  notificationAdapterList.map(async (pro): Promise<NotificationAdapterExport> => {
    const module = await import(`../../notification/adapter/${pro}`);
    return module as NotificationAdapterExport;
  }),
);

notificationAdapterRouter.post('/try', async (req, res) => {
  const { id, fields } = req.body as {
    id: string;
    fields: NotificationAdapterFields;
  };

  const adapter: NotificationAdapterExport | undefined = notificationAdapter.find(
    (adapter) => adapter.config.id === id,
  );

  if (adapter == null) {
    new HTTPError(res).setStatusCode(404).addError('Notification adapter not found').send();
    return;
  }

  const notificationConfig: NotificationAdapterConfig[] = [];
  const notificationObject: NotificationAdapterFields = {};

  Object.keys(fields).forEach((key: string) => {
    const field = fields[key];
    if (field !== undefined) notificationObject[key] = field;
  });

  notificationConfig.push({
    fields: { ...notificationObject },
    enabled: true, // Assuming enabled is always true for try calls
    id,
  });

  try {
    const testListing: Listing = {
      id: 'testListing',
      price: '42 €',
      title: 'This is a test listing',
      address: 'some address',
      size: '666 2m',
      link: 'https://www.orange-coding.net',
    };

    await adapter.send({
      serviceName: 'TestCall',
      newListings: [testListing],
      notificationConfig,
      jobKey: 'TestJob',
    });
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Type', 'text/plain');
    res.statusCode = 200;
    res.send('Test notification sent successfully');
  } catch (error: unknown) {
    console.error(error);
    new HTTPError(res)
      .setStatusCode(500)
      .addError(error as string | Error)
      .send();
    return;
  }
});

notificationAdapterRouter.get('/', async (req, res) => {
  const adapterConfigs = notificationAdapter.map((adapter) => adapter.config);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(adapterConfigs));
});

export { notificationAdapterRouter };
