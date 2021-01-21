import { notificationAdapter } from './models/notificationAdapter';
import createLoadingPlugin from '@rematch/loading';
import { provider } from './models/provider';
import { createLogger } from 'redux-logger';
import { jobs } from './models/jobs';
import { user } from './models/user';
import { init } from '@rematch/core';

const middleware = [];

if (process.env.NODE_ENV === 'development') {
  // eslint-disable-line no-redeclare
  middleware.push(createLogger({ duration: false, collapsed: (getState, action, logEntry) => !logEntry.error }));
}

const store = init({
  name: 'fredy',
  models: {
    notificationAdapter,
    provider,
    jobs,
    user,
  },
  plugins: [createLoadingPlugin({})],
  redux: {
    middlewares: middleware,
  },
});

export const reduxStore = store;
