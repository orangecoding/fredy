const db = {};

exports.init = () => {
  return new Promise(resolve => {
    resolve();
  });
};

exports.setKnownListings = (jobKey, providerId, listings) => {
  if (!Array.isArray(listings)) throw Error('Not a valid array');

  db[providerId] = listings;
};

exports.getKnownListings = (jobKey, providerId) => {
  return db[providerId] || [];
};

exports.setNumberOfTotalFoundProviderListings = () => {
  /*noop*/
};

exports.getForTesting = () => {
  return db;
};
/*
class Store {
    constructor(name) {
        this._name = name;
        this._db = {};
    }

    get warmup() {
        this._db = {};
        return new Promise(resolve => resolve());
    }

    set knownListings(value) {
        if (!Array.isArray(value)) throw Error('Not a valid array');
        return new Promise(resolve => {
            this._db[this._name] = value;
            resolve(value);
        });
    }

    get knownListings() {
        return this._db[this._name] || [];
    }
}

module.exports = Store;
*/
