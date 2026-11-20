/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import {
  hasLlmApiKey,
  isHttpUrl,
  isLlmDraftConfigured,
  isLlmDraftEnabled,
  llmEndpointOf,
  prepareLlmSettings,
} from '../../../lib/services/application/llmSettings.js';

describe('isLlmDraftEnabled', () => {
  it('is on only for an explicit true', () => {
    expect(isLlmDraftEnabled({ llmEnabled: true })).toBe(true);
    expect(isLlmDraftEnabled({ llmEnabled: 'true' })).toBe(false);
    expect(isLlmDraftEnabled({})).toBe(false);
    expect(isLlmDraftEnabled(null)).toBe(false);
  });
});

describe('isLlmDraftConfigured', () => {
  it('needs an http(s) base URL and a model, and no key', () => {
    expect(isLlmDraftConfigured({ llmBaseUrl: 'http://localhost:11434/v1', llmModel: 'llama3.1' })).toBe(true);
    expect(isLlmDraftConfigured({ llmBaseUrl: 'https://api.openai.com/v1', llmModel: ' ' })).toBe(false);
    expect(isLlmDraftConfigured({ llmBaseUrl: '', llmModel: 'gpt' })).toBe(false);
    expect(isLlmDraftConfigured({ llmBaseUrl: 'ftp://host/v1', llmModel: 'gpt' })).toBe(false);
  });
});

describe('isHttpUrl', () => {
  it('accepts http and https only', () => {
    expect(isHttpUrl(' https://a.example ')).toBe(true);
    expect(isHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl(42)).toBe(false);
  });
});

describe('hasLlmApiKey and llmEndpointOf', () => {
  it('reports whether a key is stored without needing its value', () => {
    expect(hasLlmApiKey({ llmApiKey: 'sk-1' })).toBe(true);
    expect(hasLlmApiKey({ llmApiKey: '  ' })).toBe(false);
    expect(hasLlmApiKey({})).toBe(false);
  });

  it('trims the endpoint and drops trailing slashes', () => {
    expect(llmEndpointOf({ llmBaseUrl: ' https://a.example/v1// ', llmModel: ' m ', llmApiKey: ' k ' })).toEqual({
      baseUrl: 'https://a.example/v1',
      model: 'm',
      apiKey: 'k',
    });
    expect(llmEndpointOf({ llmBaseUrl: 'http://x', llmModel: 'm' }).apiKey).toBe('');
  });
});

describe('prepareLlmSettings', () => {
  it('keeps the stored key when the form posts an empty one', () => {
    for (const empty of ['', '   ']) {
      const incoming = { llmApiKey: empty };
      expect(prepareLlmSettings(incoming)).toBeNull();
      expect(incoming).not.toHaveProperty('llmApiKey');
    }
  });

  it('removes the stored key on an explicit null', () => {
    const incoming = { llmApiKey: null };
    expect(prepareLlmSettings(incoming)).toBeNull();
    expect(incoming.llmApiKey).toBe('');
  });

  it('stores a new key trimmed', () => {
    const incoming = { llmApiKey: '  sk-new  ' };
    prepareLlmSettings(incoming);
    expect(incoming.llmApiKey).toBe('sk-new');
  });

  it('refuses a base URL that is not http(s), and accepts an empty one', () => {
    expect(prepareLlmSettings({ llmBaseUrl: 'ftp://host' })).toMatch(/llmBaseUrl/);
    expect(prepareLlmSettings({ llmBaseUrl: 'nonsense' })).toMatch(/llmBaseUrl/);
    const empty = { llmBaseUrl: '  ' };
    expect(prepareLlmSettings(empty)).toBeNull();
    expect(empty.llmBaseUrl).toBe('');
  });

  it('coerces the switch, trims the text fields and drops the read-only flag', () => {
    const incoming = {
      llmEnabled: 'yes',
      llmBaseUrl: ' https://a.example/v1 ',
      llmModel: ' gpt ',
      llmApiKeySet: true,
    };
    expect(prepareLlmSettings(incoming)).toBeNull();
    expect(incoming).toEqual({ llmEnabled: false, llmBaseUrl: 'https://a.example/v1', llmModel: 'gpt' });
  });

  it('leaves a save of another page alone', () => {
    const incoming = { interval: 30 };
    expect(prepareLlmSettings(incoming)).toBeNull();
    expect(incoming).toEqual({ interval: 30 });
  });
});
