/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('node-fetch', () => ({ default: fetchMock }));

const { send, sendPriceChange } = await import('../../lib/notification/adapter/http.js');

const listing = { id: 'l1', title: 'Flat', address: 'Somewhere 1', price: '900', link: 'https://example.com/l1' };

const sendWith = (fields) =>
  send({
    serviceName: 'test',
    newListings: [listing],
    notificationConfig: [{ id: 'http', fields }],
    jobKey: 'job',
    baseUrl: '',
  });

const sendPriceChangeWith = (fields) =>
  sendPriceChange({
    serviceName: 'test',
    priceChanges: [{ ...listing, oldPrice: '900', newPrice: '850', changePercent: '-5.6%', direction: 'down' }],
    notificationConfig: [{ id: 'http', fields }],
    jobKey: 'job',
    baseUrl: '',
  });

/** The `agent` option of the one request the adapter made. */
const agentOption = () => fetchMock.mock.calls[0][1].agent;

describe('http adapter connection', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
  });

  // Leaving the agent out is what puts the post on Node's global agent, and with it behind the
  // proxy `NODE_USE_ENV_PROXY` configures (#535).
  it.each([
    ['send', sendWith],
    ['sendPriceChange', sendPriceChangeWith],
  ])('%s leaves the agent to Node unless the endpoint is self-signed', async (_name, call) => {
    await call({ endpointUrl: 'https://hooks.example.com/fredy' });
    expect(agentOption()).toBeUndefined();
  });

  it.each([
    ['send', sendWith],
    ['sendPriceChange', sendPriceChangeWith],
  ])('%s skips certificate verification for a self-signed https endpoint only', async (_name, call) => {
    await call({ endpointUrl: 'https://nas.local/fredy', selfSignedCerts: true });
    const agentFor = agentOption();

    expect(agentFor(new URL('https://nas.local/fredy')).options.rejectUnauthorized).toBe(false);
    // An https agent on a plain http request makes Node throw; that one stays on the global agent.
    expect(agentFor(new URL('http://nas.local/fredy'))).toBeUndefined();
  });
});
