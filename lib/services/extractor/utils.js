import logger from '../logger.js';

let debuggingOn = false;

export const DEFAULT_HEADER = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/140.0.7339.207 Safari/537.36',
  'Sec-CH-UA': '"Chromium";v="140", "Not.A/Brand";v="8"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-User': '?1',
  'Sec-Fetch-Dest': 'document',
  Referer: 'https://www.google.com/',
  DNT: '1',
  TE: 'trailers',
};

export const setDebug = (options) => {
  debuggingOn = !!options?.debug;
};

export const debug = (message) => {
  if (debuggingOn) {
    logger.debug(message);
  }
};

export const botDetected = (pageSource, statusCode) => {
  const suspiciousStatusCodes = [403, 429];
  const botDetectionPatterns = [/verify you are human/i, /access denied/i, /x-amz-cf-id/i];

  const detectedInSource = botDetectionPatterns.some((pattern) => pattern.test(pageSource));
  const detectedByStatus = suspiciousStatusCodes.includes(statusCode);

  return detectedInSource || detectedByStatus;
};
