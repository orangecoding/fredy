const axios = require('axios');

function makeDriver(headers = {}) {
  let cookies = '';

  return async function driver(context, callback) {
    const url = context.url;
    let result;
    try {
      result = await axios({
        url,
        headers: {
          ...headers,
          Cookie: cookies,
        },
      });
    } catch (exception) {
      callback(exception, null);
    }

    if (typeof result.data === 'object' && url.toLowerCase().indexOf('scrapingant') !== -1) {
      //assume we have gotten a response from scrapingAnt
      if (cookies.length === 0) {
        cookies = result.data.cookies;
      }
      callback(null, result.data.content);
    } else {
      callback(null, result.data);
    }
  };
}

module.exports = makeDriver;
