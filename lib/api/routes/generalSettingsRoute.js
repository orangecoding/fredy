const service = require('restana')();
const generalSettingsRouter = service.newRouter();
const config = require('../../../conf/config.json');
const fs = require('fs');

generalSettingsRouter.get('/', async (req, res) => {
  res.body = Object.assign({}, config);
  res.send();
});

generalSettingsRouter.post('/', async (req, res) => {
  const settings = req.body;

  try {
    fs.writeFileSync(`${__dirname}/../../../conf/config.json`, JSON.stringify(settings));
  } catch (err) {
    console.error(err);
    res.send(new Error('Error while trying to write settings.'));
    return;
  }
  res.send();
});

exports.generalSettingsRouter = generalSettingsRouter;
