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

  get bla() {}

  get knownListings() {
    return this._db[this._name] || [];
  }
}

module.exports = Store;
