/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn(async () => ({}));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));
vi.mock('../../lib/services/markdown.js', () => ({ readAdapterReadme: () => '' }));

import * as http from '../../lib/notification/adapter/http.js';
import * as smtp from '../../lib/notification/adapter/smtp.js';
import { APPLICATION_DRAFT_HEADING } from '../../lib/notification/applicationDraftMessage.js';

/*
 * The draft belongs to the listing, so it is not Telegram's alone: the channels with room for a
 * letter carry it too, and a channel without one still links to the listing in Fredy, where the
 * draft is.
 */

const listing = (overrides = {}) => ({
  id: 'l1',
  title: 'Helle Wohnung',
  link: 'https://example.com/expose/1',
  address: 'Musterweg 1, Hamburg',
  price: '1200 €',
  size: '75 m²',
  ...overrides,
});

describe('the http adapter', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  });

  afterEach(() => fetchSpy.mockRestore());

  const posted = async (newListings) => {
    await http.send({
      serviceName: 'immoscout',
      newListings,
      notificationConfig: [{ id: 'http', fields: { endpointUrl: 'https://hook.example/fredy' } }],
      jobKey: 'job-1',
      baseUrl: 'https://fredy.example',
    });
    return JSON.parse(fetchSpy.mock.calls[0][1].body).listings;
  };

  it('carries the draft as a field of its listing', async () => {
    const [sent] = await posted([listing({ applicationDraft: '  Guten Tag,\n\nich interessiere mich.  ' })]);

    expect(sent.applicationDraft).toBe('Guten Tag,\n\nich interessiere mich.');
    expect(sent.fredyUrl).toBe('https://fredy.example/#/listings/listing/l1');
  });

  it('leaves the field out for a listing without a draft, and for a blank one', async () => {
    const [none, blank] = await posted([listing(), listing({ id: 'l2', applicationDraft: '   ' })]);

    expect(none).not.toHaveProperty('applicationDraft');
    expect(blank).not.toHaveProperty('applicationDraft');
  });
});

describe('the smtp adapter', () => {
  beforeEach(() => sendMail.mockClear());

  const mailed = async (newListings) => {
    await smtp.send({
      serviceName: 'immoscout',
      newListings,
      notificationConfig: [
        {
          id: 'smtp',
          fields: { host: 'smtp.example', port: '587', receiver: 'me@example.com', from: 'fredy@example.com' },
        },
      ],
      jobKey: 'job-1',
      baseUrl: 'https://fredy.example',
    });
    return sendMail.mock.calls[0][0].html;
  };

  it('puts the draft under its listing, line by line, with the warning that a model wrote it', async () => {
    const html = await mailed([listing({ applicationDraft: 'Guten Tag,\nich interessiere mich.' })]);

    expect(html).toContain(APPLICATION_DRAFT_HEADING);
    expect(html).toContain('Guten Tag,<br/>ich interessiere mich.<br/>');
  });

  it('escapes the draft, since a model wrote it from text an advertiser chose', async () => {
    const html = await mailed([listing({ applicationDraft: '<script>alert(1)</script>' })]);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('sends a listing without a draft as before', async () => {
    const html = await mailed([listing()]);

    expect(html).not.toContain(APPLICATION_DRAFT_HEADING);
  });
});
