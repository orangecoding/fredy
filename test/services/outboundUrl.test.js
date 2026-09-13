/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { isPubliclyFetchableUrl } from '../../lib/services/security/outboundUrl.js';

describe('isPubliclyFetchableUrl', () => {
  it.each([
    'https://pic.immoscout24.de/listing.jpg',
    'http://images.example.com/a/b/c.png?size=large',
    'https://cdn.example.co.uk:8443/photo.webp',
    'https://8.8.8.8/photo.jpg',
    'https://[2606:4700:4700::1111]/photo.jpg',
    'https://[::ffff:8.8.8.8]/photo.jpg',
  ])('lets a public http(s) address through: %s', (url) => {
    expect(isPubliclyFetchableUrl(url)).toBe(true);
  });

  it.each([
    ['loopback by name', 'http://localhost:9998/api/user'],
    ['the reserved loopback TLD', 'http://fredy.localhost/secret'],
    ['loopback by address', 'http://127.0.0.1:9998/api/user'],
    ['anywhere in 127/8', 'http://127.4.5.6/'],
    ['a private class A', 'http://10.0.0.5/admin'],
    ['a private class B', 'http://172.20.1.1/admin'],
    ['a private class C', 'http://192.168.1.1/admin'],
    ['carrier NAT', 'http://100.100.0.1/'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['the unspecified address', 'http://0.0.0.0/'],
    ['broadcast', 'http://255.255.255.255/'],
    ['multicast', 'http://239.1.2.3/'],
    ['IPv6 loopback', 'http://[::1]:9998/api/user'],
    ['an IPv4-mapped loopback', 'http://[::ffff:127.0.0.1]/'],
    ['an IPv4-mapped private address', 'http://[::ffff:192.168.1.1]/'],
    ['a unique local address', 'http://[fd00::1]/'],
    ['an IPv6 link-local address', 'http://[fe80::1]/'],
  ])('refuses %s', (_what, url) => {
    expect(isPubliclyFetchableUrl(url)).toBe(false);
  });

  it.each([
    ['file', 'file:///etc/passwd'],
    ['data', 'data:image/png;base64,iVBORw0KGgo='],
    ['ftp', 'ftp://example.com/photo.jpg'],
    ['javascript', 'javascript:alert(1)'],
  ])('refuses the %s scheme', (_what, url) => {
    expect(isPubliclyFetchableUrl(url)).toBe(false);
  });

  it('refuses a URL that carries credentials', () => {
    expect(isPubliclyFetchableUrl('http://admin:hunter2@example.com/photo.jpg')).toBe(false);
  });

  it.each([null, undefined, '', 'not a url', 'https://', 42, {}])('refuses the unusable input %s', (value) => {
    expect(isPubliclyFetchableUrl(value)).toBe(false);
  });

  it('sees through the notations a dotted quad can be written in', () => {
    // The URL parser normalises all of these to 127.0.0.1 before the guard reads the hostname,
    // which is the only reason it does not have to parse them itself.
    expect(isPubliclyFetchableUrl('http://2130706433/')).toBe(false);
    expect(isPubliclyFetchableUrl('http://0x7f.0x0.0x0.0x1/')).toBe(false);
    expect(isPubliclyFetchableUrl('http://0177.0.0.1/')).toBe(false);
  });

  it('does not pretend to resolve names', () => {
    // Documenting the hole rather than claiming it is closed: a hostname pointing at a private
    // address passes, and only a resolve-then-connect check would catch it.
    expect(isPubliclyFetchableUrl('http://router.example.com/')).toBe(true);
  });
});
