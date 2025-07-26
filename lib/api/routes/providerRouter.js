import restana from 'restana';
import providers from '../../provider/index.js';

const service = restana();
const providerRouter = service.newRouter();

providerRouter.get('/', async (req, res) => {
  res.body = providers.map((p) => p.metaInformation);
  res.send();
});
export { providerRouter };
