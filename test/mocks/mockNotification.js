export const _tmpStore = {};
export const send = moduleExports.send;
export const get = moduleExports.get;
const moduleExports = {
  _tmpStore,
  send: (serviceName, payload) => {
    this._tmpStore = { serviceName, payload };
    return [Promise.resolve()];
  },
  get: () => {
    return this._tmpStore;
  },
};
export default moduleExports;
