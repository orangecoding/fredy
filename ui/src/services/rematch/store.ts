import { init, Models, RematchRootState } from '@rematch/core';
import createLoadingPlugin, { ExtraModelsFromLoading, LoadingConfig } from '@rematch/loading';
import { Middleware } from 'redux';

// Import the actual model objects
import { notificationAdapter } from './models/notificationAdapter';
import { user } from './models/user';
import { generalSettings } from './models/generalSettings';
import { provider } from './models/provider';
import { jobs } from './models/jobs';
import { demoMode } from './models/demoMode';
import { createLogger, LogEntryObject } from 'redux-logger';

export interface RootModel extends Models<RootModel> {
  notificationAdapter: typeof notificationAdapter;
  generalSettings: typeof generalSettings;
  demoMode: typeof demoMode;
  provider: typeof provider;
  jobs: typeof jobs;
  user: typeof user;
}

// StoreModel is the complete model for the store, including the loading plugin.
export type StoreModel = RootModel & ExtraModelsFromLoading<RootModel>;

const middleware: Middleware[] = [];
if (process.env.NODE_ENV === 'development') {
  middleware.push(
    createLogger({
      duration: false,
      collapsed: (getState: unknown, action: unknown, logEntry: LogEntryObject | undefined) => !logEntry?.error,
    }),
  );
}

const loadingPlugin = createLoadingPlugin<RootModel, ExtraModelsFromLoading<RootModel>, LoadingConfig>({});

export const store = init<RootModel, ExtraModelsFromLoading<RootModel>>({
  name: 'fredy',
  models: {
    notificationAdapter,
    generalSettings,
    demoMode,
    provider,
    jobs,
    user,
  },
  plugins: [loadingPlugin],
  redux: {
    middlewares: middleware,
  },
});

export type Store = typeof store;
export type RootState = RematchRootState<StoreModel>;
