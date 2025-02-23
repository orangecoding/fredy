import fs from 'fs';
import restana from 'restana';
const service = restana();
const providerRouter = service.newRouter();
const providerList = fs.readdirSync('./lib/provider').filter((file) => file.endsWith('.js'));
// @ts-expect-error TS(1378): Top-level 'await' expressions are only allowed whe... Remove this comment to see the full error message
const provider = await Promise.all(
  providerList.map(async (pro) => {
    return await import(`../../provider/${pro}`);
  })
);
providerRouter.get('/', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
  res.body = provider.map((p) => p.metaInformation);
  res.send();
});
export { providerRouter };
