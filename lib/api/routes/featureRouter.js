import restana from 'restana';
import getFeatures from '../../features.js';
const service = restana();
const featureRouter = service.newRouter();

featureRouter.get('/', async (req, res) => {
  const features = getFeatures();
  res.body = Object.assign({}, { features });
  res.send();
});

export { featureRouter };
