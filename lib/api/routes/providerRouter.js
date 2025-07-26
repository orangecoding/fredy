import fs from 'fs';
import restana from 'restana';
const service = restana();
const providerRouter = service.newRouter();
const providerList = fs.readdirSync('./lib/provider').filter((file) => file.endsWith('.js'));
const provider = await Promise.all(
  providerList.map(async (pro) => {
    return await import(`../../provider/${pro}`);
  }),
);
providerRouter.get('/', async (req, res) => {
  res.body = provider.map((p) => p.metaInformation);
  res.send();
});
export { providerRouter };
