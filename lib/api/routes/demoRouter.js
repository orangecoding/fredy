import restana from 'restana';
import { config } from '../../utils.js';
const service = restana();
const demoRouter = service.newRouter();

demoRouter.get('/', async (req, res) => {
  res.body = Object.assign({}, { demoMode: config.demoMode });
  res.send();
});

export { demoRouter };
