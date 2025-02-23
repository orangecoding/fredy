import restana from 'restana';
import {config, getDirName, readConfigFromStorage, refreshConfig} from '../../utils.js';
import fs from 'fs';
import {handleDemoUser} from '../../services/storage/userStorage.js';
const service = restana();
const generalSettingsRouter = service.newRouter();
generalSettingsRouter.get('/', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
  res.body = Object.assign({}, config);
  res.send();
});
generalSettingsRouter.post('/', async (req, res) => {
  const settings = req.body;
  try {
    // @ts-expect-error TS(2339): Property 'demoMode' does not exist on type '{}'.
    if(config.demoMode){
      res.send(new Error('In demo mode, it is not allowed to change these settings.'));
      return;
    }
    const currentConfig = await readConfigFromStorage();
    // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
    fs.writeFileSync(`${getDirName()}/../conf/config.json`, JSON.stringify({...currentConfig, ...settings}));
    await refreshConfig();
    handleDemoUser();
  } catch (err) {
    console.error(err);
    res.send(new Error('Error while trying to write settings.'));
    return;
  }
  res.send();
});
export { generalSettingsRouter };
