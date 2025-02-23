import { notificationAdapterRouter } from './routes/notificationAdapterRouter';
import { authInterceptor, cookieSession, adminInterceptor } from './security';
import { generalSettingsRouter } from './routes/generalSettingsRoute';
import { analyticsRouter } from './routes/analyticsRouter';
import { providerRouter } from './routes/providerRouter';
import { loginRouter } from './routes/loginRoute';
import { config } from '../utils';
import { GeneralSettings } from '../types/GeneralSettings';
import { userRouter } from './routes/userRoute';
import { jobRouter } from './routes/jobRouter';
import bodyParser from 'body-parser';
import restana from 'restana';
import file from 'serve-static';
import path from 'path';
import { getDirName } from '../utils';
import { demoRouter } from './routes/demoRouter';

const service = restana();
const staticService = file(path.join(getDirName(), '../ui/public'));
const PORT = (config as GeneralSettings).port || 9998;

service.use(bodyParser.json());
service.use(cookieSession());
service.use(staticService);
service.use('/api/admin', authInterceptor());
service.use('/api/jobs', authInterceptor());
// /admin can only be accessed when user is having admin permissions
service.use('/api/admin', adminInterceptor());
service.use('/api/jobs/notificationAdapter', notificationAdapterRouter);
service.use('/api/admin/generalSettings', generalSettingsRouter);
service.use('/api/jobs/provider', providerRouter);
service.use('/api/jobs/insights', analyticsRouter);
service.use('/api/admin/users', userRouter);
service.use('/api/jobs', jobRouter);
service.use('/api/login', loginRouter);
//this route is unsecured intentionally as it is being queried from the login page
service.use('/api/demo', demoRouter);

service.start(PORT).then(() => {
  // eslint-disable-next-line no-console
  console.info(`Started API service on port ${PORT}`);
});
