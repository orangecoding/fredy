const path = require('path');
const DB_PATH = path.dirname(require.main.filename) + '/conf/store.json';

const FileAsync = require('lowdb/adapters/FileAsync');
const adapter = new FileAsync(DB_PATH);
const low = require('lowdb');

const lowdb = low(adapter);

class Store {
  constructor(name) {
    this._name = name;
    this._db = null;
  }

  get warmup() {
    return new Promise(resolve => {
      lowdb.then(db => {
        this._db = db;
        resolve();
      });
    });
  }

  set knownListings(value) {
    if (!Array.isArray(value)) throw Error('Not a valid array');

    return this._db.set(this._name, value).write();
  }

  get knownListings() {
    return this._db.get(this._name).value() || [];
  }
}

module.exports = Store;
