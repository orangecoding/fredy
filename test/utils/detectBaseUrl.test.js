/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs');
vi.mock('os');

import * as fsMock from 'fs';
import * as osMock from 'os';
import { isRunningInDocker, detectLocalIp, guessBaseUrl } from '../../lib/utils/detectBaseUrl.js';

describe('detectBaseUrl', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    delete process.env.FREDY_DOCKER;
    delete process.env.FREDY_HOST_IP;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isRunningInDocker', () => {
    it('returns true when FREDY_DOCKER=1', () => {
      process.env.FREDY_DOCKER = '1';
      expect(isRunningInDocker()).toBe(true);
    });

    it('returns false when no Docker signals present', () => {
      vi.mocked(fsMock.accessSync).mockImplementation(() => {
        throw new Error('not found');
      });
      vi.mocked(fsMock.readFileSync).mockImplementation(() => {
        throw new Error('not found');
      });
      expect(isRunningInDocker()).toBe(false);
    });

    it('returns true when /.dockerenv is accessible', () => {
      vi.mocked(fsMock.accessSync).mockReturnValue(undefined);
      expect(isRunningInDocker()).toBe(true);
    });

    it('returns true when /proc/self/cgroup contains docker', () => {
      vi.mocked(fsMock.accessSync).mockImplementation(() => {
        throw new Error('not found');
      });
      vi.mocked(fsMock.readFileSync).mockReturnValue('12:cpu:/docker/abc123');
      expect(isRunningInDocker()).toBe(true);
    });

    it('returns true when /proc/self/cgroup contains containerd', () => {
      vi.mocked(fsMock.accessSync).mockImplementation(() => {
        throw new Error('not found');
      });
      vi.mocked(fsMock.readFileSync).mockReturnValue('0::/../containerd/abc');
      expect(isRunningInDocker()).toBe(true);
    });
  });

  describe('detectLocalIp', () => {
    it('returns 172.17.0.1 when running in Docker (default)', () => {
      process.env.FREDY_DOCKER = '1';
      expect(detectLocalIp()).toBe('172.17.0.1');
    });

    it('returns FREDY_HOST_IP when set in Docker', () => {
      process.env.FREDY_DOCKER = '1';
      process.env.FREDY_HOST_IP = '192.168.1.50';
      expect(detectLocalIp()).toBe('192.168.1.50');
    });

    it('skips docker bridge IPs and returns real LAN IP', () => {
      vi.mocked(fsMock.accessSync).mockImplementation(() => {
        throw new Error();
      });
      vi.mocked(fsMock.readFileSync).mockImplementation(() => {
        throw new Error();
      });
      vi.mocked(osMock.networkInterfaces).mockReturnValue({
        docker0: [{ family: 'IPv4', address: '172.17.0.1', internal: false }],
        en0: [{ family: 'IPv4', address: '192.168.1.100', internal: false }],
      });
      expect(detectLocalIp()).toBe('192.168.1.100');
    });

    it('prefers en0 over arbitrary interfaces', () => {
      vi.mocked(fsMock.accessSync).mockImplementation(() => {
        throw new Error();
      });
      vi.mocked(fsMock.readFileSync).mockImplementation(() => {
        throw new Error();
      });
      vi.mocked(osMock.networkInterfaces).mockReturnValue({
        utun3: [{ family: 'IPv4', address: '10.8.0.1', internal: false }],
        en0: [{ family: 'IPv4', address: '192.168.178.50', internal: false }],
      });
      expect(detectLocalIp()).toBe('192.168.178.50');
    });

    it('falls back to localhost when no suitable interface found', () => {
      vi.mocked(fsMock.accessSync).mockImplementation(() => {
        throw new Error();
      });
      vi.mocked(fsMock.readFileSync).mockImplementation(() => {
        throw new Error();
      });
      vi.mocked(osMock.networkInterfaces).mockReturnValue({
        lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
      });
      expect(detectLocalIp()).toBe('localhost');
    });
  });

  describe('guessBaseUrl', () => {
    it('returns correctly formatted URL', () => {
      process.env.FREDY_DOCKER = '1';
      expect(guessBaseUrl(9998)).toBe('http://172.17.0.1:9998');
    });

    it('includes custom port', () => {
      process.env.FREDY_DOCKER = '1';
      expect(guessBaseUrl(8080)).toBe('http://172.17.0.1:8080');
    });
  });
});
