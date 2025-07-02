import fs from 'fs';
import restana from 'restana';
import { ProviderExport } from '#types/ProviderConfig.js';
import { ReqWithSession } from '#types/Api.ts';

const service = restana();
const providerRouter = service.newRouter();

const providerList = fs.readdirSync('./lib/provider').filter((file: string) => file.endsWith('.ts'));

const provider: ProviderExport[] = await Promise.all(
  providerList.map(async (pro) => {
    const module = await import(`../../provider/${pro}`);
    return module as ProviderExport;
  }),
);

providerRouter.get('/', async (req: ReqWithSession, res) => {
  const providerMetaInformation = provider.map((p) => p.metaInformation);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(providerMetaInformation));
});

export { providerRouter };
