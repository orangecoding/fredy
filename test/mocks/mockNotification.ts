let tmpStore = {};

export const send = (serviceName: any, payload: any) => {
  tmpStore = { serviceName, payload };
  return [Promise.resolve()];
};

export const get = () => {
  return tmpStore;
};
