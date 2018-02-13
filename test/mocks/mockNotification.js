module.exports = {
  _tmpStore: {},

  send: (serviceName, payload) => {
    this._tmpStore = { serviceName, payload };
    return [Promise.resolve()];
  },

  get: () => {
    return this._tmpStore;
  }
};
