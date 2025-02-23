import { markdown2Html } from '../../services/markdown.js';
import Database from 'better-sqlite3';
export const send = ({ serviceName, newListings, jobKey }) => {
  const db = new Database('db/listings.db');
  const fields = ['serviceName', 'jobKey', 'id', 'size', 'rooms', 'price', 'address', 'title', 'link', 'description'];
  db.prepare(`CREATE TABLE IF NOT EXISTS listing (${fields.join(' TEXT, ')} TEXT);`).run();
  const insert = db.prepare(`INSERT INTO listing (${fields.join(', ')}) VALUES (@${fields.join(', @')})`);
  newListings.map((listing) => {
    let insertListing = {};
    fields.map((field) => {
      insertListing[field] = listing[field];
    });
    insertListing.serviceName = serviceName;
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
