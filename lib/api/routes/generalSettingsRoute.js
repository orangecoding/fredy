import restana from 'restana';
import {config, getDirName, readConfigFromStorage, refreshConfig} from '../../utils.js';
import fs from 'fs';
const service = restana();
const generalSettingsRouter = service.newRouter();
generalSettingsRouter.get('/', async (req, res) => {
  res.body = Object.assign({}, config);
  res.send();
});
generalSettingsRouter.post('/', async (req, res) => {
  const settings = req.body;
  try {
    const currentConfig = await readConfigFromStorage();
    fs.writeFileSync(`${getDirName()}/../conf/config.json`, JSON.stringify({...currentConfig, ...settings}));
    await refreshConfig();
  } catch (err) {
    console.error(err);
    res.send(new Error('Error while trying to write settings.'));
    return;
  }
  res.send();
});
export { generalSettingsRouter };
