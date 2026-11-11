/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const { downloadMock, ensureBinaryMock, usesClearcoteMock } = vi.hoisted(() => ({
  downloadMock: vi.fn(),
  ensureBinaryMock: vi.fn(),
  usesClearcoteMock: vi.fn(),
}));

vi.mock('clearcote', () => ({ download: downloadMock }));
vi.mock('cloakbrowser', () => ({ ensureBinary: ensureBinaryMock }));
vi.mock('../../lib/services/extractor/browserEngine.js', () => ({ usesClearcote: usesClearcoteMock }));

const { ensureValidBinary } = await import('../../lib/services/ensureValidBinary.js');

describe('ensureValidBinary', () => {
  beforeEach(() => {
    downloadMock.mockReset();
    ensureBinaryMock.mockReset();
  });

  it("leaves a Clearcote machine to Clearcote's own verified download", async () => {
    usesClearcoteMock.mockReturnValue(true);
    downloadMock.mockResolvedValue('/home/node/.cache/clearcote/v0.1.0-pre.25/browser/chrome');

    await expect(ensureValidBinary()).resolves.toBe('/home/node/.cache/clearcote/v0.1.0-pre.25/browser/chrome');
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(ensureBinaryMock).not.toHaveBeenCalled();
  });

  it('fetches no Clearcote build where CloakBrowser is the engine', async () => {
    usesClearcoteMock.mockReturnValue(false);
    ensureBinaryMock.mockRejectedValue(new Error('offline'));

    await expect(ensureValidBinary()).rejects.toThrow('offline');
    expect(ensureBinaryMock).toHaveBeenCalledTimes(1);
    expect(downloadMock).not.toHaveBeenCalled();
  });
});
