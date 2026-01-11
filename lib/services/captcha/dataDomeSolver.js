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
    // DataDome captchas are loaded in an iframe from geo.captcha-delivery.com
    const captchaUrl = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="captcha-delivery.com"]');
      if (iframe) {
        return iframe.src;
      }
      // Also check for the captcha container directly
      const captchaContainer = document.querySelector('[class*="captcha"]');
      if (captchaContainer) {
        // Look for the URL in the page
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const match = script.textContent?.match(/https:\/\/geo\.captcha-delivery\.com[^"'\s]+/);
          if (match) {
            return match[0];
          }
        }
      }
      return null;
    });

    if (captchaUrl) {
      return { detected: true, captchaUrl };
    }

    // Check page title for verification indicator
    const title = await page.title();
    if (title.toLowerCase().includes('verification') || title.toLowerCase().includes('captcha')) {
      // Try to find the captcha URL from network requests or page content
      const pageContent = await page.content();
      const match = pageContent.match(/https:\/\/geo\.captcha-delivery\.com[^"'\s]+/);
      if (match) {
        return { detected: true, captchaUrl: match[0] };
      }
      return { detected: true, captchaUrl: null };
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

    logger.debug('Creating 2Captcha task for DataDome...');
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
    logger.debug(`2Captcha task created: ${taskId}`);

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
        return { success: false, error: 'No cookie in solution' };
      }

      logger.debug(`2Captcha task ${taskId} still processing (attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS})`);
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
  // Parse the cookie string
  const parts = cookieString.split(';').map((p) => p.trim());
  const [nameValue] = parts;
  const [name, value] = nameValue.split('=');

  const cookie = {
    name: name,
    value: value,
    domain: domain.startsWith('.') ? domain : `.${domain}`,
    path: '/',
    secure: true,
    sameSite: 'Lax',
  };

  await page.setCookie(cookie);
  logger.debug(`Applied DataDome cookie to ${domain}`);
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
