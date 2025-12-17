/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { notificationAdapterRouter } from './routes/notificationAdapterRouter.js';
import { authInterceptor, cookieSession, adminInterceptor } from './security.js';
import { generalSettingsRouter } from './routes/generalSettingsRoute.js';
import { providerRouter } from './routes/providerRouter.js';
import { versionRouter } from './routes/versionRouter.js';
import { loginRouter } from './routes/loginRoute.js';
import { userRouter } from './routes/userRoute.js';
import { jobRouter } from './routes/jobRouter.js';
import bodyParser from 'body-parser';
import restana from 'restana';
import files from 'serve-static';
import path from 'path';
import { getDirName } from '../utils.js';
import { demoRouter } from './routes/demoRouter.js';
import logger from '../services/logger.js';
import { listingsRouter } from './routes/listingsRouter.js';
import { getSettings } from '../services/storage/settingsStorage.js';
import { featureRouter } from './routes/featureRouter.js';
import { dashboardRouter } from './routes/dashboardRouter.js';
import { backupRouter } from './routes/backupRouter.js';
const service = restana();
const staticService = files(path.join(getDirName(), '../ui/public'));
const PORT = (await getSettings()).port || 9998;

service.use(bodyParser.json());
service.use(cookieSession());
service.use(staticService);
service.use('/api/admin', authInterceptor());
service.use('/api/jobs', authInterceptor());
service.use('/api/version', authInterceptor());
service.use('/api/listings', authInterceptor());
service.use('/api/dashboard', authInterceptor());
service.use('/api/features', authInterceptor());

// /admin can only be accessed when user is having admin permissions
service.use('/api/admin', adminInterceptor());
service.use('/api/jobs/notificationAdapter', notificationAdapterRouter);
service.use('/api/admin/generalSettings', generalSettingsRouter);
service.use('/api/admin/backup', backupRouter);
service.use('/api/jobs/provider', providerRouter);
service.use('/api/admin/users', userRouter);
service.use('/api/version', versionRouter);
service.use('/api/jobs', jobRouter);
service.use('/api/login', loginRouter);
service.use('/api/listings', listingsRouter);
service.use('/api/features', featureRouter);
service.use('/api/dashboard', dashboardRouter);
//this route is unsecured intentionally as it is being queried from the login page
service.use('/api/demo', demoRouter);

service.start(PORT).then(() => {
  logger.debug(`Started API service on port ${PORT}`);
});
