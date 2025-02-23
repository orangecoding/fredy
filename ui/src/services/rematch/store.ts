import { notificationAdapter } from './models/notificationAdapter';
import { generalSettings } from './models/generalSettings';
import createLoadingPlugin from '@rematch/loading';
import { provider } from './models/provider';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'redu... Remove this comment to see the full error message
import { createLogger } from 'redux-logger';
import { jobs } from './models/jobs';
import { user } from './models/user';
import { demoMode } from './models/demoMode.js';
import { init } from '@rematch/core';
const middleware = [];
if (process.env.NODE_ENV === 'development') {
  // eslint-disable-line no-redeclare
  middleware.push(createLogger({ duration: false, collapsed: (getState: any, action: any, logEntry: any) => !logEntry.error }));
}
const store = init({
  name: 'fredy',
  models: {
    notificationAdapter,
    generalSettings,
    demoMode,
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
