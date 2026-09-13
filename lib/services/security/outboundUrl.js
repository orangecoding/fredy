/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Whether a URL that came out of the database is safe for the server to fetch.
 *
 * Listing image URLs are scraped, not typed: whatever a portal put in its markup is what ends up
 * in the `image_url` column, and something that later asks Fredy to fetch it - the MCP photo tool
 * does - is asking the server to make a request on behalf of whoever wrote that markup. On a
 * self-hosted box that server sits inside a home network, next to a router admin page, a NAS and
 * whatever else answers on a private address, so the addresses worth refusing are the ones only
 * the server can reach.
 *
 * What this does not do is resolve the hostname. A name that points at 192.168.1.1 passes here and
 * is caught by nothing; covering that needs a resolve-then-connect check against the address
 * actually dialled, which Node's fetch does not expose. The literal forms below are what a scraped
 * URL realistically carries, and refusing them costs nothing.
 */

/** Schemes worth fetching at all. `file:`, `data:` and friends have no business here. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Whether a dotted-quad address belongs to a range that never appears on the public internet.
 *
 * @param {number[]} octets - Four numbers, already known to be 0-255.
 * @returns {boolean}
 */
function isPrivateIPv4(octets) {
  const [a, b] = octets;
  if (a === 0) return true; // "this network", and 0.0.0.0 itself
  if (a === 10) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT, RFC 6598
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking, RFC 2544
  if (a >= 224) return true; // multicast and reserved, incl. 255.255.255.255
  return false;
}

/**
 * Parse a hostname that is a literal IPv4 address.
 *
 * The URL parser has already normalised the octal, hex and single-number notations to a dotted
 * quad by the time a hostname reaches here, so this only has to read the plain form.
 *
 * @param {string} hostname
 * @returns {number[]|null} The four octets, or null when the hostname is not an IPv4 literal.
 */
function parseIPv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (octets.some((octet) => !Number.isInteger(octet) || octet > 255)) return null;
  return octets;
}

/**
 * Whether a literal IPv6 address is one only this host or this network can reach.
 *
 * @param {string} hostname - The hostname with its surrounding brackets already removed.
 * @returns {boolean}
 */
function isPrivateIPv6(hostname) {
  const address = hostname.toLowerCase();
  if (address === '::1' || address === '::') return true;
  // An IPv4-mapped address is an IPv4 destination wearing a different notation. The URL parser
  // rewrites the readable form (::ffff:127.0.0.1) into two hex groups (::ffff:7f00:1), so that is
  // the shape this has to read.
  const mapped = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped != null) {
    const high = Number.parseInt(mapped[1], 16);
    const low = Number.parseInt(mapped[2], 16);
    return isPrivateIPv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
  }
  if (/^f[cd]/.test(address)) return true; // unique local, fc00::/7
  if (/^fe[89ab]/.test(address)) return true; // link local, fe80::/10
  return false;
}

/**
 * Whether the server may fetch this URL.
 *
 * @param {string|null|undefined} rawUrl - The URL as stored.
 * @returns {boolean} True only for an http(s) URL naming an address outside this machine and its
 *   local networks.
 */
export function isPubliclyFetchableUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false;

  const hostname = url.hostname.toLowerCase();
  if (hostname.length === 0) return false;
  // Not a routing decision but a credential one: a URL carrying a username or password is asking
  // the server to authenticate somewhere, which a scraped image URL never legitimately does.
  if (url.username.length > 0 || url.password.length > 0) return false;

  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return !isPrivateIPv6(hostname.slice(1, -1));
  }

  const octets = parseIPv4(hostname);
  if (octets != null) {
    return !isPrivateIPv4(octets);
  }

  // `localhost` resolves to the loopback everywhere, and the reserved `.localhost` TLD is defined
  // to do the same.
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;

  return true;
}
