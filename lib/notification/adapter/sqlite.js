const { markdown2Html } = require('../../services/markdown');
const Database = require('better-sqlite3');

/**
 * simply prints out the found data to the console
 * @param serviceName e.g immowelt
 * @param newListings an array with newly found listings
 * @param jobKey name of the current job that is being executed
 */
exports.send = ({ serviceName, newListings, jobKey }) => {
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

exports.config = {
  id: __filename.slice(__dirname.length + 1, -3),
  name: 'Sqlite',
  description: 'This adapter stores listings in a local sqlite3 database.',
  config: {},
  readme: markdown2Html('lib/notification/adapter/sqlite.md'),
};
