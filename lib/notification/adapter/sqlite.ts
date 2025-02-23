import { markdown2Html } from '#services/markdown';
import Database from 'better-sqlite3';
import { NotificationAdapterConfig, SendNotificationArgs } from '#types/NotificationAdapter.ts';
import { Listing } from '#types/Listings.ts';

export const send = ({ serviceName, newListings, jobKey }: SendNotificationArgs) => {
  const db = new Database('db/listings.db');
  const fields = ['serviceName', 'jobKey', 'id', 'size', 'rooms', 'price', 'address', 'title', 'link', 'description'];
  db.prepare(`CREATE TABLE IF NOT EXISTS listing (${fields.join(' TEXT, ')} TEXT);`).run();
  const insert = db.prepare(`INSERT INTO listing (${fields.join(', ')}) VALUES (@${fields.join(', @')})`);
  newListings.map((listing: Listing) => {
    const insertListing: Partial<Listing & { serviceName: string; jobKey: string }> = {};

    Object.keys(listing).forEach((key) => {
      if (fields.includes(key)) {
        const val = listing[key as keyof Listing];
        if (val === undefined) return;
        insertListing[key as keyof Listing] = val;
      }
    });

    insertListing.serviceName = serviceName;
    insertListing.jobKey = jobKey;
    insert.run(insertListing);
  });
  return Promise.resolve();
};

export const config: NotificationAdapterConfig = {
  id: 'sqlite',
  name: 'Sqlite',
  description: 'This adapter stores listings in a local sqlite3 database.',
  readme: markdown2Html('lib/notification/adapter/sqlite.md'),
  fields: {},
};
