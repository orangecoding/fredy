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
    // First check the current URL - DataDome sometimes redirects to captcha page
    let currentUrl;
    try {
      currentUrl = page.url();
      logger.debug(`Current page URL: ${currentUrl}`);
    } catch (e) {
      logger.debug('Could not get current URL:', e.message);
    }

    // Check if we're on a DataDome captcha page directly
    if (currentUrl && currentUrl.includes('captcha-delivery.com')) {
      logger.debug('Page URL contains captcha-delivery.com');
      return { detected: true, captchaUrl: currentUrl };
    }

    // Try to get page content - this is more reliable than evaluate for detecting patterns
    let pageContent;
    try {
      pageContent = await page.content();
      logger.debug(`Page content length: ${pageContent.length}`);
    } catch (e) {
      logger.debug('Could not get page content:', e.message);
      pageContent = '';
    }

    // Check if this is a Chrome error page
    if (currentUrl && currentUrl.startsWith('chrome-error://')) {
      logger.debug('Page is showing a Chrome error - likely proxy or network issue');
      // Try to extract the error from the page
      if (pageContent) {
        const errorMatch = pageContent.match(/<div id="main-message">[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i);
        if (errorMatch) {
          logger.debug(`Chrome error message: ${errorMatch[1].trim()}`);
        }
        // Also check for error-code
        const errorCodeMatch = pageContent.match(/class="error-code"[^>]*>([^<]+)</i);
        if (errorCodeMatch) {
          logger.debug(`Chrome error code: ${errorCodeMatch[1].trim()}`);
        }
      }
      return { detected: false };
    }

    // Look for DataDome indicators in content
    if (pageContent) {
      // Check for DataDome captcha URL pattern
      const captchaUrlMatch = pageContent.match(/https:\/\/geo\.captcha-delivery\.com[^"'\s<>]+/);
      if (captchaUrlMatch) {
        // Decode HTML entities (e.g., &amp; -> &)
        const captchaUrl = decodeHtmlEntities(captchaUrlMatch[0]);
        logger.debug(`Found captcha URL in page content: ${captchaUrl}`);
        return { detected: true, captchaUrl };
      }

      // Check for DataDome iframe
      if (pageContent.includes('captcha-delivery.com')) {
        logger.debug('Page content contains captcha-delivery.com reference');
        // Try to extract the URL more carefully
        const iframeSrcMatch = pageContent.match(/src=["']([^"']*captcha-delivery\.com[^"']*)/i);
        if (iframeSrcMatch) {
          logger.debug(`Found captcha iframe src: ${iframeSrcMatch[1]}`);
          return { detected: true, captchaUrl: iframeSrcMatch[1] };
        }
        return { detected: true, captchaUrl: null };
      }

      // Check for DataDome blocking indicators
      if (
        pageContent.includes('dd_challenge_container') ||
        pageContent.includes('datadome') ||
        pageContent.includes('DD_check')
      ) {
        logger.debug('Found DataDome challenge indicators in page');
        return { detected: true, captchaUrl: null };
      }
    }

    // Check page title for verification indicator
    let title = '';
    try {
      title = await page.title();
      logger.debug(`Page title: "${title}"`);
    } catch (e) {
      logger.debug('Could not get page title:', e.message);
    }

    if (
      title.toLowerCase().includes('verification') ||
      title.toLowerCase().includes('captcha') ||
      title.toLowerCase().includes('blocked') ||
      title.toLowerCase().includes('access denied')
    ) {
      logger.debug('Page title indicates captcha/block');
      return { detected: true, captchaUrl: null };
    }

    // Try to detect via page evaluate (may fail if frame is detached)
    try {
      const captchaUrl = await page.evaluate(() => {
        const iframe = document.querySelector('iframe[src*="captcha-delivery.com"]');
        if (iframe) {
          return iframe.src;
        }
        return null;
      });
      if (captchaUrl) {
        logger.debug(`Found captcha iframe via evaluate: ${captchaUrl}`);
        return { detected: true, captchaUrl };
      }
    } catch (e) {
      logger.debug('Page evaluate failed (frame may be detached):', e.message);
    }

    logger.debug('No DataDome captcha indicators found');
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
          logger.debug(`Cookie value: ${cookie.substring(0, 100)}...`);
          return { success: true, cookie };
        }
        logger.warn('2Captcha solution missing cookie:', JSON.stringify(resultData.solution));
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
  logger.debug(`Raw cookie string from 2Captcha: ${cookieString}`);

  // Parse the cookie string - handle all attributes from 2Captcha response
  const parts = cookieString.split(';').map((p) => p.trim());
  const [nameValue] = parts;
  const equalIndex = nameValue.indexOf('=');
  const name = nameValue.substring(0, equalIndex);
  const value = nameValue.substring(equalIndex + 1);

  // Parse additional attributes
  let cookieDomain = domain.startsWith('.') ? domain : `.${domain}`;
  let path = '/';
  let secure = true;
  let sameSite = 'None'; // DataDome uses SameSite=None

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

  logger.debug(
    `Parsed cookie - name: ${name}, value length: ${value.length}, domain: ${cookieDomain}, sameSite: ${sameSite}`,
  );

  const cookie = {
    name: name,
    value: value,
    domain: cookieDomain,
    path: path,
    secure: secure,
    sameSite: sameSite,
  };

  // Delete any existing datadome cookie first
  const existingCookies = await page.cookies();
  const existingDataDome = existingCookies.find((c) => c.name === 'datadome');
  if (existingDataDome) {
    logger.debug(`Deleting existing datadome cookie from ${existingDataDome.domain}`);
    await page.deleteCookie({ name: 'datadome', domain: existingDataDome.domain });
  }

  await page.setCookie(cookie);
  logger.debug(`Applied DataDome cookie to ${cookieDomain}`);

  // Verify the cookie was set
  const verifyingCookies = await page.cookies();
  const newCookie = verifyingCookies.find((c) => c.name === 'datadome');
  if (newCookie) {
    logger.debug(`Verified datadome cookie set: domain=${newCookie.domain}, value length=${newCookie.value.length}`);
  } else {
    logger.warn('Failed to verify datadome cookie was set!');
  }
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
