/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * DataDome captcha solver using 2Captcha API
 * https://2captcha.com/api-docs/datadome-slider-captcha
 */

import logger from '../logger.js';

const TWOCAPTCHA_API_URL = 'https://api.2captcha.com';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 5 minutes max

/**
 * Detects if a page is showing a DataDome captcha challenge.
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<{detected: boolean, captchaUrl?: string}>}
 */
export async function detectDataDomeCaptcha(page) {
  try {
    const currentUrl = safeGetUrl(page);

    // Check if we're on a DataDome captcha page directly
    if (currentUrl?.includes('captcha-delivery.com')) {
      return { detected: true, captchaUrl: currentUrl };
    }

    // Chrome error pages are not captchas
    if (currentUrl?.startsWith('chrome-error://')) {
      return { detected: false };
    }

    const pageContent = await safeGetContent(page);

    // Look for DataDome indicators in content
    if (pageContent) {
      const captchaUrl = extractCaptchaUrl(pageContent);
      if (captchaUrl) {
        return { detected: true, captchaUrl };
      }

      if (hasDataDomeIndicators(pageContent)) {
        return { detected: true, captchaUrl: null };
      }
    }

    // Check page title for blocking indicators
    const title = await safeGetTitle(page);
    if (titleIndicatesBlock(title)) {
      return { detected: true, captchaUrl: null };
    }

    // Try to detect via page evaluate (may fail if frame is detached)
    const iframeCaptchaUrl = await safeEvaluateCaptchaIframe(page);
    if (iframeCaptchaUrl) {
      return { detected: true, captchaUrl: iframeCaptchaUrl };
    }

    return { detected: false };
  } catch (err) {
    logger.warn('Error detecting DataDome captcha:', err.message);
    return { detected: false };
  }
}

/**
 * Solves a DataDome captcha using 2Captcha API.
 * @param {Object} params
 * @param {string} params.apiKey - 2Captcha API key
 * @param {string} params.websiteUrl - The URL of the page with the captcha
 * @param {string} params.captchaUrl - The DataDome captcha iframe URL
 * @param {string} params.userAgent - Browser user agent string
 * @param {Object} params.proxy - Proxy configuration
 * @param {string} params.proxy.url - Proxy URL (e.g., http://host:port)
 * @param {string} [params.proxy.username] - Proxy username
 * @param {string} [params.proxy.password] - Proxy password
 * @returns {Promise<{success: boolean, cookie?: string, error?: string}>}
 */
export async function solveDataDomeCaptcha({ apiKey, websiteUrl, captchaUrl, userAgent, proxy }) {
  if (!apiKey) {
    return { success: false, error: 'No 2Captcha API key configured' };
  }

  if (!captchaUrl) {
    return { success: false, error: 'No captcha URL provided' };
  }

  // Check if the captcha URL indicates a blocked IP (t=bv)
  if (captchaUrl.includes('t=bv')) {
    return { success: false, error: 'IP is blocked by DataDome (t=bv). Rotate proxy.' };
  }

  // Interstitial pages are not solvable captchas - only /captcha/ URLs with t=fe are
  if (captchaUrl.includes('/interstitial/')) {
    logger.info('DataDome interstitial detected (not a solvable captcha), skipping 2Captcha');
    return { success: false, error: 'Interstitial page detected, not a captcha' };
  }

  try {
    // Parse proxy URL
    const proxyParsed = parseProxyUrl(proxy.url);
    if (!proxyParsed) {
      return { success: false, error: 'Invalid proxy URL format' };
    }

    // Create task
    const createTaskPayload = {
      clientKey: apiKey,
      task: {
        type: 'DataDomeSliderTask',
        websiteURL: websiteUrl,
        captchaUrl: captchaUrl,
        userAgent: userAgent,
        proxyType: proxyParsed.protocol,
        proxyAddress: proxyParsed.host,
        proxyPort: proxyParsed.port,
      },
    };

    // Add proxy auth if provided
    if (proxy.username) {
      createTaskPayload.task.proxyLogin = proxy.username;
    }
    if (proxy.password) {
      createTaskPayload.task.proxyPassword = proxy.password;
    }

    logger.info(`2Captcha task payload: ${JSON.stringify({ ...createTaskPayload, clientKey: '[REDACTED]' })}`);

    const createResponse = await fetch(`${TWOCAPTCHA_API_URL}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createTaskPayload),
    });

    const createResult = await createResponse.json();

    if (createResult.errorId !== 0) {
      return {
        success: false,
        error: `2Captcha create task failed: ${createResult.errorCode} - ${createResult.errorDescription}`,
      };
    }

    const taskId = createResult.taskId;
    logger.info(`2Captcha task created: ${taskId}, captchaUrl: ${captchaUrl}`);

    // Poll for result
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);

      const resultResponse = await fetch(`${TWOCAPTCHA_API_URL}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: apiKey,
          taskId: taskId,
        }),
      });

      const resultData = await resultResponse.json();

      if (resultData.errorId !== 0) {
        return {
          success: false,
          error: `2Captcha get result failed: ${resultData.errorCode} - ${resultData.errorDescription}`,
        };
      }

      if (resultData.status === 'ready') {
        const cookie = resultData.solution?.cookie;
        if (cookie) {
          logger.debug('2Captcha solved DataDome captcha successfully');
          return { success: true, cookie };
        }
        logger.warn('2Captcha solution missing cookie');
        return { success: false, error: 'No cookie in solution' };
      }
    }

    return { success: false, error: 'Timeout waiting for 2Captcha solution' };
  } catch (err) {
    logger.error('Error solving DataDome captcha:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Applies a solved DataDome cookie to a Puppeteer page.
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} cookieString - The cookie string from 2Captcha (e.g., "datadome=xxx; Path=/; ...")
 * @param {string} domain - The target domain (e.g., "immoscout24.ch")
 * @returns {Promise<void>}
 */
export async function applyDataDomeCookie(page, cookieString, domain) {
  const cookie = parseCookieString(cookieString, domain);

  // Delete any existing datadome cookie first
  const existingCookies = await page.cookies();
  const existingDataDome = existingCookies.find((c) => c.name === 'datadome');
  if (existingDataDome) {
    await page.deleteCookie({ name: 'datadome', domain: existingDataDome.domain });
  }

  await page.setCookie(cookie);
  logger.debug(`Applied DataDome cookie to ${cookie.domain}`);
}

/**
 * Parse a proxy URL into components.
 * @param {string} url - Proxy URL (e.g., "http://host:port" or "socks5://host:port")
 * @returns {{protocol: string, host: string, port: number} | null}
 */
function parseProxyUrl(url) {
  if (!url) return null;

  try {
    // Handle URLs without protocol
    let fullUrl = url;
    if (!url.includes('://')) {
      fullUrl = `http://${url}`;
    }

    const parsed = new URL(fullUrl);
    let protocol = parsed.protocol.replace(':', '');

    // Map to 2Captcha expected values
    if (protocol === 'https') protocol = 'http';
    if (!['http', 'socks4', 'socks5'].includes(protocol)) {
      protocol = 'http';
    }

    return {
      protocol,
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || (protocol === 'http' ? 80 : 1080),
    };
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decode HTML entities in a string.
 * @param {string} str - String with potential HTML entities
 * @returns {string} Decoded string
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

// --- Detection helper functions ---

function safeGetUrl(page) {
  try {
    return page.url();
  } catch {
    return null;
  }
}

async function safeGetContent(page) {
  try {
    return await page.content();
  } catch {
    return '';
  }
}

async function safeGetTitle(page) {
  try {
    return await page.title();
  } catch {
    return '';
  }
}

async function safeEvaluateCaptchaIframe(page) {
  try {
    return await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="captcha-delivery.com"]');
      return iframe?.src ?? null;
    });
  } catch {
    return null;
  }
}

function extractCaptchaUrl(content) {
  // Check for DataDome captcha URL pattern
  const captchaUrlMatch = content.match(/https:\/\/geo\.captcha-delivery\.com[^"'\s<>]+/);
  if (captchaUrlMatch) {
    return decodeHtmlEntities(captchaUrlMatch[0]);
  }

  // Check for DataDome iframe src
  const iframeSrcMatch = content.match(/src=["']([^"']*captcha-delivery\.com[^"']*)/i);
  if (iframeSrcMatch) {
    return iframeSrcMatch[1];
  }

  return null;
}

function hasDataDomeIndicators(content) {
  return (
    content.includes('captcha-delivery.com') ||
    content.includes('dd_challenge_container') ||
    content.includes('datadome') ||
    content.includes('DD_check')
  );
}

function titleIndicatesBlock(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  return (
    lower.includes('verification') ||
    lower.includes('captcha') ||
    lower.includes('blocked') ||
    lower.includes('access denied')
  );
}

/**
 * Parse a cookie string into a Puppeteer cookie object.
 * @param {string} cookieString - Cookie string (e.g., "datadome=xxx; Path=/; ...")
 * @param {string} domain - Default domain for the cookie
 * @returns {Object} Puppeteer cookie object
 */
function parseCookieString(cookieString, domain) {
  const parts = cookieString.split(';').map((p) => p.trim());
  const [nameValue] = parts;
  const equalIndex = nameValue.indexOf('=');
  const name = nameValue.substring(0, equalIndex);
  const value = nameValue.substring(equalIndex + 1);

  let cookieDomain = domain.startsWith('.') ? domain : `.${domain}`;
  let path = '/';
  let secure = true;
  let sameSite = 'None';

  for (const part of parts.slice(1)) {
    const lower = part.toLowerCase();
    if (lower.startsWith('domain=')) {
      cookieDomain = part.substring(7);
    } else if (lower.startsWith('path=')) {
      path = part.substring(5);
    } else if (lower === 'secure') {
      secure = true;
    } else if (lower.startsWith('samesite=')) {
      sameSite = part.substring(9);
    }
  }

  return { name, value, domain: cookieDomain, path, secure, sameSite };
}
