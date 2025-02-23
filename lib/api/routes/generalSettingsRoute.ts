import restana from 'restana';
import { config, getDirName, readConfigFromStorage, refreshConfig } from '../../utils';
import fs from 'fs';
import { handleDemoUser } from '#services/storage/userStorage';
const service = restana();
const generalSettingsRouter = service.newRouter();
import { GeneralSettings } from '#types/GeneralSettings.ts';
import { ReqWithSession } from '#types/api.ts';
import { HTTPError } from '../errorHandling';

generalSettingsRouter.get('/', async (req: ReqWithSession, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(Object.assign({}, config)));
});
generalSettingsRouter.post('/', async (req: ReqWithSession, res) => {
  const settings = req.body as Partial<GeneralSettings>;
  try {
    if (config.demoMode) {
      new HTTPError(res)
        .setStatusCode(403)
        .addError('In demo mode, it is not allowed to change these settings.')
        .send();
      return;
    }
    const currentConfig = await readConfigFromStorage();
    const newConfig: GeneralSettings = { ...currentConfig, ...settings };
    fs.writeFileSync(`${getDirName()}/../conf/config.json`, JSON.stringify(newConfig));
    await refreshConfig();
    handleDemoUser();
  } catch (err) {
    console.error(err);
    new HTTPError(res).setStatusCode(500).addError('Error while trying to write settings.').send();
    return;
  }
  res.send('');
});
export { generalSettingsRouter };
