const makeDriver = require('request-x-ray');
const Xray = require('x-ray');

class Scraper {
  constructor() {
    const filters = {
      removeNewline: this._removeNewline,
      trim: this._trim,
      int: this._int,
    };

    const driver = makeDriver({
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.85 Safari/537.36',
        cookie:
          'longUnreliableState="dWlkcg==:YS1kZDViMzVhZWRhMTk0MDdmYWRjNDNkY2VmYTcxZmVkOQ=="; eveD=eyJldnRfZ2FfYWN0aW9uIjpbInNlYXJjaCJdLCJldnRfZ2FfY2F0ZWdvcnkiOlsicmVzdWx0bGlzdCJdLCJnZW9fYmxuIjpbIm5vcmRyaGVpbl93ZXN0ZmFsZW4iXSwiZXZ0X2dhX2xhYmVsIjpbImRpc3RyaWN0Il0sIm9ial9pdHlwIjpbIndvaG51bmdfa2F1ZiJdLCJnZW9fa3JzIjpbImTDvHNzZWxkb3JmIl0sImdlb19sYW5kIjpbImRldXRzY2hsYW5kIl0sIm9ial9yZXN1bHRsaXN0X2NvdW50IjpbIjI4NCJdLCJvYmpfY3Jvc3N0eXBlIjpbImxpdl9hcGFydG1lbnRfYnV5Il19; ABNTEST=9526230109; is24_experiment_visitor_id=d568590b-951b-45c3-b890-13feef6ee472; reese84=3:Xf3JwcTIC3yeubDXqWBTfg==:oqnDVs58wBxZRMfpzPnlzLzscVQhboRBffkM4caxNe+vLBdozdtdrCwpcTKyvIuhB9MOMCAinb2qnSTL4D9kLpqL72gl+jtl7QdiNAEn2erDKLqX4b9/K5wFU7j6qzxFWdfcMUm295qU3o3s7O8CM8HdghKYOVtoif+qTkeztphyYMfmAePYkfYRhZXZaFwHwxUfkRVUEX2VKoepkTf9TudCHsTYXWqvnpUt/CT+yrFHlUdTgdTWfD5tQJvn3inPqKERAB8TTKoHIvM4duBJV/5fZDax07CHNqHcKhrws0pq4y2ssKfdxLxCE0OIpnMSOtmn7O0koDoV6RzRjNUC+UZ7mhPFH+YSPHTb+6VJsZQDnRufEIz4B1WWIORV+jvHzfIli9OHsmOPnskA6mnCpFwEvQAfJu9R+jI9dccjFno=:Oc7c2wwYiNMBJnvZeDCIKLP0LuVVPWJ4kzd5MPlsoTg=',
      },
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
