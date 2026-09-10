/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SOLVER_TIMEOUT_MS,
  challengeSolverUrl,
  solveChallenge,
} from '../../../lib/services/extractor/challengeSolver.js';

vi.mock('../../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/**
 * The optional scrape service that clears a bot wall.
 *
 * Everything here turns on the same rule: an installation that has not named a solver must not be
 * changed by the existence of one, and an installation that has named one must not lose its run
 * when the service is down. So the only two answers this ever gives are a page and null.
 */
describe('the challenge solver', () => {
  const endpoint = 'http://solver.local/v1';

  beforeEach(() => {
    delete process.env.FREDY_CHALLENGE_SOLVER_URL;
  });

  afterEach(() => {
    delete process.env.FREDY_CHALLENGE_SOLVER_URL;
    vi.unstubAllGlobals();
  });

  it('is not configured until the environment names one', () => {
    expect(challengeSolverUrl()).toBe(null);
    process.env.FREDY_CHALLENGE_SOLVER_URL = `  ${endpoint}  `;
    expect(challengeSolverUrl()).toBe(endpoint);
  });

  it('reads a solver url that is only whitespace as no solver at all', () => {
    process.env.FREDY_CHALLENGE_SOLVER_URL = '   ';
    expect(challengeSolverUrl()).toBe(null);
  });

  it('asks nobody anything when no solver is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await solveChallenge('https://example.com/search', 'test')).toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the page it wants and hands back what the solver earned', async () => {
    process.env.FREDY_CHALLENGE_SOLVER_URL = endpoint;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        solution: {
          response: '<html>the results</html>',
          cookies: [{ name: 'datadome', value: 'abc' }],
          userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const answer = await solveChallenge('https://example.com/search', 'test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(endpoint);
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({
      cmd: 'request.get',
      url: 'https://example.com/search',
      maxTimeout: SOLVER_TIMEOUT_MS,
    });
    expect(answer).toEqual({
      html: '<html>the results</html>',
      cookies: [{ name: 'datadome', value: 'abc' }],
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    });
  });

  /** A service that answers with the fields at the top level rather than under `solution`. */
  it('reads the flat answer shape as well', async () => {
    process.env.FREDY_CHALLENGE_SOLVER_URL = endpoint;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ html: '<html>flat</html>' }) }),
    );

    expect(await solveChallenge('https://example.com/search', 'test')).toEqual({
      html: '<html>flat</html>',
      cookies: [],
      userAgent: undefined,
    });
  });

  it('gives up on an answer that carries no page', async () => {
    process.env.FREDY_CHALLENGE_SOLVER_URL = endpoint;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    expect(await solveChallenge('https://example.com/search', 'test')).toBe(null);
  });

  it('gives up when the solver refuses', async () => {
    process.env.FREDY_CHALLENGE_SOLVER_URL = endpoint;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => ({}) }),
    );

    expect(await solveChallenge('https://example.com/search', 'test')).toBe(null);
  });

  it('gives up when the solver never answers', async () => {
    process.env.FREDY_CHALLENGE_SOLVER_URL = endpoint;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })),
    );

    expect(await solveChallenge('https://example.com/search', 'test')).toBe(null);
  });
});
