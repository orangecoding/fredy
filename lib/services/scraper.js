const makeDriver = require('request-x-ray');
const config = require('../../conf/config.json');
const Xray = require('x-ray');

class Scraper {
  constructor() {
    const filters = {
      removeNewline: this._removeNewline,
      trim: this._trim,
      int: this._int
    };

    const driver = makeDriver({
      headers: {
        'User-Agent': config.userAgent
      }
    });

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
