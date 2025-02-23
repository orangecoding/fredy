import fs from 'fs';
import path from 'path';
import {
  NotificationAdapterConfig,
  NotificationAdapterExport,
  SendNotificationArgs,
} from '#types/NotificationAdapter.ts';

const folderPath: string = path.join(__dirname, 'adapter');

async function importAllTsFiles(dir: string) {
  const files = await fs.promises.readdir(dir);

  const modules = (await Promise.all(
    files.filter((file: string) => file.endsWith('.ts')).map((file) => import(path.join(dir, file))),
  )) as NotificationAdapterExport[];

  return modules;
}

const adapter: NotificationAdapterExport[] = await importAllTsFiles(folderPath);

if (adapter.length === 0) {
  throw new Error('Please specify at least one notification provider');
}

const findAdapter = (notificationConfigItem: NotificationAdapterConfig) => {
  return adapter.find((a) => a.config.id === notificationConfigItem.id);
};

export const send = (
  serviceName: string,
  newListings: SendNotificationArgs['newListings'],
  notificationConfig: NotificationAdapterConfig[],
  jobKey: string,
) => {
  //this is not being used in tests, therefore adapter are always set
  return notificationConfig
    .filter((notificationConfigItem) => findAdapter(notificationConfigItem) != null)
    .map((notificationConfigItem) => findAdapter(notificationConfigItem))
    .filter((a) => a !== undefined)
    .map((a) => a.send({ serviceName, newListings, notificationConfig, jobKey }));
};
