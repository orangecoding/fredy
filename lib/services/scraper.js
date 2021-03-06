const config = require('../../conf/config.json');
const makeDriver = require('./requestDriver');
const Xray = require('x-ray');

class Scraper {
  constructor() {
    const filters = {
      removeNewline: this._removeNewline,
      trim: this._trim,
      int: this._int,
    };

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.85 Safari/537.36',
    };

    if (config.scrapingAnt != null && config.scrapingAnt.apiKey != null) {
      headers['x-api-key'] = config.scrapingAnt.apiKey;
    }
    const driver = makeDriver(headers);

    const xray = Xray({ filters });
    xray.driver(driver);

    this.xray = xray;
  }

  get x() {
    return this.xray;
  }

  _removeNewline(value) {
    return typeof value === 'string' ? value.replace(/\\n/g, '') : value;
  }

  _trim(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;
  }

  _int(value) {
    return typeof value === 'string' ? parseInt(value, 10) : value;
  }
}

module.exports = new Scraper().x;
