module.exports = {
  _tmpStore: {},

  send: (serviceName, payload) => {
    this._tmpStore = { serviceName, payload };
  },

  get: () => {
    return this._tmpStore;
  }
};
