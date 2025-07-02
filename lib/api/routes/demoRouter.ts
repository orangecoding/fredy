import restana from 'restana';
import { config } from '../../utils';
import { ReqWithSession } from '#types/Api.ts';
const service = restana();
const demoRouter = service.newRouter();

demoRouter.get('/', async (req: ReqWithSession, res) => {
  const responseData = {
    demoMode: config.demoMode ?? false,
  };
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(responseData));
});

export { demoRouter };
