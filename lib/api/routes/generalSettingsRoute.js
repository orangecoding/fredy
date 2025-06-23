import restana from 'restana';
import {config, getDirName, readConfigFromStorage, refreshConfig} from '../../utils/utils.js';
import fs from 'fs';
import {handleDemoUser} from '../../services/storage/userStorage.js';

const service = restana();
const generalSettingsRouter = service.newRouter();

generalSettingsRouter.get('/', async (req, res) => {
  // Don't send the API keys in the response
  const safeConfig = { ...config };
  if (safeConfig.chatgpt) {
    safeConfig.chatgpt = {
      ...safeConfig.chatgpt,
      apiKey: safeConfig.chatgpt.apiKey ? '********' : '' // Mask the API key if it exists
    };
  }
  if (safeConfig.googleMaps) {
    safeConfig.googleMaps = {
      ...safeConfig.googleMaps,
      apiKey: safeConfig.googleMaps.apiKey ? '********' : '' // Mask the API key if it exists
    };
  }
  res.body = safeConfig;
  res.send();
});

generalSettingsRouter.post('/', async (req, res) => {
  const settings = req.body;
  try {
    if(config.demoMode){
      res.send(new Error('In demo mode, it is not allowed to change these settings.'));
      return;
    }

    const currentConfig = await readConfigFromStorage();
    
    // Handle ChatGPT settings specially
    if (settings.chatgpt) {
      // Only update the API key if a new one is provided
      if (settings.chatgpt.apiKey === '********') {
        settings.chatgpt.apiKey = currentConfig.chatgpt?.apiKey || '';
      }
    }

    // Handle Google Maps settings specially
    if (settings.googleMaps) {
      // Only update the API key if a new one is provided
      if (settings.googleMaps.apiKey === '********') {
        settings.googleMaps.apiKey = currentConfig.googleMaps?.apiKey || '';
      }
    }

    // Merge the new settings with the current config
    const newConfig = { ...currentConfig, ...settings };
    
    // Write the updated config to file
    fs.writeFileSync(
      `${getDirName()}/../conf/config.json`, 
      JSON.stringify(newConfig, null, 2)
    );
    
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
