const { notificationAdapterRouter } = require('./routes/notificationAdapterRouter');
const { authInterceptor, cookieSession, adminInterceptor } = require('./security');
const { generalSettingsRouter } = require('./routes/generalSettingsRoute');
const { analyticsRouter } = require('./routes/analyticsRouter');
const { providerRouter } = require('./routes/providerRouter');
const { loginRouter } = require('./routes/loginRoute');
const config = require('../../conf/config.json');
const { userRouter } = require('./routes/userRoute');
const { jobRouter } = require('./routes/jobRouter');
const bodyParser = require('body-parser');
const service = require('restana')();
const files = require('serve-static');
const path = require('path');

const staticService = files(path.join(__dirname, '../../ui/public'));

const PORT = config.port || 9998;

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

/* eslint-disable no-console */
service.start(PORT).then(() => {
  console.info(`Started API service on port ${PORT}`);
});
/* eslint-enable no-console */
