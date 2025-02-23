import { markdown2Html } from '../../services/markdown.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'bett... Remove this comment to see the full error message
import Database from 'better-sqlite3';
export const send = ({
  serviceName,
  newListings,
  jobKey
}: any) => {
  const db = new Database('db/listings.db');
  const fields = ['serviceName', 'jobKey', 'id', 'size', 'rooms', 'price', 'address', 'title', 'link', 'description'];
  db.prepare(`CREATE TABLE IF NOT EXISTS listing (${fields.join(' TEXT, ')} TEXT);`).run();
  const insert = db.prepare(`INSERT INTO listing (${fields.join(', ')}) VALUES (@${fields.join(', @')})`);
  newListings.map((listing: any) => {
    let insertListing = {};
    fields.map((field) => {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      insertListing[field] = listing[field];
    });
    // @ts-expect-error TS(2339): Property 'serviceName' does not exist on type '{}'... Remove this comment to see the full error message
    insertListing.serviceName = serviceName;
    // @ts-expect-error TS(2339): Property 'jobKey' does not exist on type '{}'.
    insertListing.jobKey = jobKey;
    insert.run(insertListing);
  });
  return Promise.resolve();
};
export const config = {
  id: 'sqlite',
  name: 'Sqlite',
  description: 'This adapter stores listings in a local sqlite3 database.',
  config: {},
  readme: markdown2Html('lib/notification/adapter/sqlite.md'),
};
