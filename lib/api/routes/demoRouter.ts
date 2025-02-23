import restana from 'restana';
import {config} from '../../utils.js';
const service = restana();
const demoRouter = service.newRouter();

demoRouter.get('/', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
  res.body = Object.assign({}, {demoMode: config.demoMode});
  res.send();
});

export { demoRouter };
