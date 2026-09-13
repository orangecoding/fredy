/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { botDetected } from '../../lib/services/extractor/utils.js';

/**
 * What the extractor throws a page away for.
 *
 * The cost of getting this wrong runs both ways: a wall read as results stores a page of nothing,
 * and results read as a wall make a provider look permanently broken. The second is what happened
 * to casa.it, which publishes the request headers it was served with inside its own store.
 */
describe('recognising a bot wall', () => {
  it('takes a refused status as a wall whatever the page says', () => {
    expect(botDetected('<html>anything at all</html>', 403)).toBe(true);
    expect(botDetected('<html>anything at all</html>', 429)).toBe(true);
  });

  it('takes the wall phrases as a wall whatever the status says', () => {
    expect(botDetected('<h1>Please verify you are human</h1>', 200)).toBe(true);
    expect(botDetected('<h1>Access Denied</h1>', 200)).toBe(true);
  });

  it('takes a short CloudFront refusal as a wall', () => {
    const refusal = '<HTML><HEAD><TITLE>ERROR</TITLE></HEAD><BODY><PRE>X-Amz-Cf-Id: abc123</PRE></BODY></HTML>';
    expect(botDetected(refusal, 200)).toBe(true);
  });

  /**
   * The regression this file exists for. A results page mentioning the header is a portal echoing
   * its own request, not CloudFront refusing one.
   */
  it('leaves a results page that merely mentions the CloudFront header alone', () => {
    const results = `<html><body>${'listing '.repeat(2000)}"x-amz-cf-id":"xZCk6mSpdOLmO8PT=="</body></html>`;
    expect(results.length).toBeGreaterThan(4096);
    expect(botDetected(results, 200)).toBe(false);
  });

  it('leaves an ordinary page alone', () => {
    expect(botDetected('<html><body>25 listings</body></html>', 200)).toBe(false);
  });
});
