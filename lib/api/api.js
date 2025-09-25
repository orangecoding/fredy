import { notificationAdapterRouter } from './routes/notificationAdapterRouter.js';
import { authInterceptor, cookieSession, adminInterceptor } from './security.js';
import { generalSettingsRouter } from './routes/generalSettingsRoute.js';
import { analyticsRouter } from './routes/analyticsRouter.js';
import { providerRouter } from './routes/providerRouter.js';
import { versionRouter } from './routes/versionRouter.js';
import { loginRouter } from './routes/loginRoute.js';
import { userRouter } from './routes/userRoute.js';
import { jobRouter } from './routes/jobRouter.js';
import { config } from '../utils.js';
import bodyParser from 'body-parser';
import restana from 'restana';
import files from 'serve-static';
import path from 'path';
import { getDirName } from '../utils.js';
import { demoRouter } from './routes/demoRouter.js';
import logger from '../services/logger.js';
import { listingsRouter } from './routes/listingsRouter.js';
const service = restana();
const staticService = files(path.join(getDirName(), '../ui/public'));
const PORT = config.port || 9998;

service.use(bodyParser.json());
service.use(cookieSession());
service.use(staticService);
service.use('/api/admin', authInterceptor());
service.use('/api/jobs', authInterceptor());
service.use('/api/version', authInterceptor());
service.use('/api/listings', authInterceptor());

// /admin can only be accessed when user is having admin permissions
service.use('/api/admin', adminInterceptor());
service.use('/api/jobs/notificationAdapter', notificationAdapterRouter);
service.use('/api/admin/generalSettings', generalSettingsRouter);
service.use('/api/jobs/provider', providerRouter);
service.use('/api/jobs/insights', analyticsRouter);
service.use('/api/admin/users', userRouter);
service.use('/api/version', versionRouter);
service.use('/api/jobs', jobRouter);
service.use('/api/login', loginRouter);
service.use('/api/listings', listingsRouter);
//this route is unsecured intentionally as it is being queried from the login page
service.use('/api/demo', demoRouter);

service.start(PORT).then(() => {
  logger.debug(`Started API service on port ${PORT}`);
});
