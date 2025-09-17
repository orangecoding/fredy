import restana from 'restana';
import { config, getDirName, readConfigFromStorage, refreshConfig } from '../../utils.js';
import fs from 'fs';
import { ensureDemoUserExists } from '../../services/storage/userStorage.js';
import logger from '../../services/logger.js';
const service = restana();
const generalSettingsRouter = service.newRouter();
generalSettingsRouter.get('/', async (req, res) => {
  res.body = Object.assign({}, config);
  res.send();
});
generalSettingsRouter.post('/', async (req, res) => {
  const settings = req.body;
  try {
    if (config.demoMode) {
      res.send(new Error('In demo mode, it is not allowed to change these settings.'));
      return;
    }
    const currentConfig = await readConfigFromStorage();
    fs.writeFileSync(`${getDirName()}/../conf/config.json`, JSON.stringify({ ...currentConfig, ...settings }));
    await refreshConfig();
    ensureDemoUserExists();
  } catch (err) {
    logger.error(err);
    res.send(new Error('Error while trying to write settings.'));
    return;
  }
  res.send();
});
export { generalSettingsRouter };
