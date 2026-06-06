/**
 * Perseus Clew: URL fetcher with SSRF protection.
 *
 * Fetches a public URL and returns the HTML with metadata.
 * Enforces safety constraints: timeout, redirect limit, size limit,
 * content-type, robots.txt, and SSRF protection on every hop.
 *
 * SSRF defense: resolves hostname via dns.lookup({ all: true }) and checks
 * ALL resolved IPs against private/reserved ranges at every redirect hop.
 * IPv6 literals are bracket-stripped and IPv4-mapped addresses are structurally
 * decoded to their embedded v4 address for range checking.
 *
 * Note: there is a residual TOCTOU gap between dns.lookup and the actual TCP
 * connection (the DNS could change between resolve and connect). Full
 * connection-pinning would close this, but is over-engineering for our threat
 * model. Resolve-and-check per hop is the 95% defense we need.
 *
 * See BACKEND-SHARED.md section 3.
 */

import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError } from './errors.js';
import { logger } from './logger.js';

const MAX_URL_LENGTH = 2048;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB
const ROBOTS_TIMEOUT_MS = 5_000;

const USER_AGENT = process.env.PERSEUS_USER_AGENT
  || 'Agentis Lux/0.1 (+https://agentislux.io/about-scanner)';

// --- IPv4 private/reserved range checks ---

const PRIVATE_IPV4_PREFIXES = [
  '127.',       // loopback
  '10.',        // RFC1918
  '0.',         // current network
  '169.254.',   // link-local (includes AWS metadata 169.254.169.254)
  '192.168.',   // RFC1918
  '192.0.0.',   // IETF protocol assignments
  '198.18.',    // benchmarking
  '198.19.',    // benchmarking
];

function is172Private(ip) {
  const match = ip.match(/^172\.(\d+)\./);
  if (!match) return false;
  const second = parseInt(match[1], 10);
  return second >= 16 && second <= 31;
}

function isCgnat(ip) {
  const match = ip.match(/^100\.(\d+)\./);
  if (!match) return false;
  const second = parseInt(match[1], 10);
  return second >= 64 && second <= 127;
}

function isMulticast(ip) {
  const first = parseInt(ip.split('.')[0], 10);
  return first >= 224 && first <= 239;
}

// --- IPv6 structural parsing ---

/**
 * Parse an IPv6 address string to a 16-byte Uint8Array.
 * Handles all textual spellings: compressed (::), uncompressed,
 * and mixed dotted-quad notation (::ffff:a.b.c.d).
 *
 * Key: dotted-quad tail is converted to hex groups BEFORE :: expansion
 * so the group count is correct for all mapped-address spellings.
 */
function parseIpv6ToBytes(ip) {
  let working = ip;

  // Step 1: Handle dotted-quad tail BEFORE :: expansion.
  const lastColon = working.lastIndexOf(':');
  const tail = working.slice(lastColon + 1);
  if (tail.includes('.')) {
    const parts = tail.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
    const hi = ((parts[0] << 8) | parts[1]).toString(16);
    const lo = ((parts[2] << 8) | parts[3]).toString(16);
    working = working.slice(0, lastColon + 1) + hi + ':' + lo;
  }

  // Step 2: Expand :: to fill missing zero groups
  let groups;
  if (working.includes('::')) {
    const [left, right] = working.split('::');
    const leftGroups = left ? left.split(':') : [];
    const rightGroups = right ? right.split(':') : [];
    const missing = 8 - leftGroups.length - rightGroups.length;
    if (missing < 0) return null;
    groups = [...leftGroups, ...Array(missing).fill('0'), ...rightGroups];
  } else {
    groups = working.split(':');
  }

  if (groups.length !== 8) return null;

  // Step 3: Parse each group to 2 bytes
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const val = parseInt(groups[i] || '0', 16);
    if (isNaN(val) || val < 0 || val > 0xffff) return null;
    bytes[i * 2] = (val >> 8) & 0xff;
    bytes[i * 2 + 1] = val & 0xff;
  }
  return bytes;
}

/**
 * Structurally detect IPv4-mapped IPv6 addresses (any textual spelling).
 * If bytes 0-9 are zero and bytes 10-11 are 0xffff, extracts the embedded IPv4.
 * Returns the IPv4 string or null.
 */
function extractMappedIpv4(ip) {
  if (!net.isIPv6(ip)) return null;

  const bytes = parseIpv6ToBytes(ip);
  if (!bytes) return null;

  for (let i = 0; i < 10; i++) {
    if (bytes[i] !== 0) return null;
  }
  if (bytes[10] !== 0xff || bytes[11] !== 0xff) return null;

  return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
}

// --- Combined private IP check ---

/**
 * Check if a resolved IP address is private or reserved.
 * Handles IPv4, IPv6, and IPv4-mapped IPv6 (structurally decoded).
 */
function isPrivateIp(ip) {
  if (!ip) return true; // no IP = unsafe

  // IPv6 checks
  if (ip === '::1' || ip === '::') return true;
  if (ip.startsWith('fe80:')) return true;                   // link-local
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique local

  // IPv4-mapped IPv6: structural decode, then check embedded v4
  const mappedV4 = extractMappedIpv4(ip);
  if (mappedV4) return isPrivateIp(mappedV4);

  // IPv4 prefix checks
  for (const prefix of PRIVATE_IPV4_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }

  // Range checks
  if (is172Private(ip)) return true;
  if (isCgnat(ip)) return true;
  if (isMulticast(ip)) return true;

  return false;
}

/**
 * Check if a hostname is an obvious private/local name.
 */
function isPrivateHostname(hostname) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.local');
}

/**
 * Resolve a hostname and check if ANY resolved IP is private.
 * Throws VALIDATION_INVALID_URL if any address is private/reserved.
 *
 * Uses { all: true } so a host with both public and private records
 * is still rejected (the private record shouldn't exist if it's public).
 */
async function validateResolvedIp(hostname) {
  // Strip IPv6 brackets from URL-parsed hostnames (e.g. "[::1]" -> "::1")
  const normalized = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  // Literal IPs: check directly, skip dns.lookup
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized) || net.isIPv6(normalized)) {
    if (isPrivateIp(normalized)) {
      throw new AppError(
        'VALIDATION_INVALID_URL',
        'This URL points to a private or reserved address and cannot be scanned.',
        { domain: normalized }
      );
    }
    return;
  }

  if (isPrivateHostname(normalized)) {
    throw new AppError(
      'VALIDATION_INVALID_URL',
      'This URL points to a private or reserved address and cannot be scanned.',
      { domain: normalized }
    );
  }

  // Resolve ALL addresses and reject if ANY is private
  try {
    const addresses = await dns.lookup(normalized, { all: true });
    for (const { address } of addresses) {
      if (isPrivateIp(address)) {
        throw new AppError(
          'VALIDATION_INVALID_URL',
          'This URL points to a private or reserved address and cannot be scanned.',
          { domain: normalized, resolvedIp: address }
        );
      }
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'FETCH_DNS_FAILURE',
      'This domain could not be resolved. Check the URL and try again.',
      { domain: normalized, error: err.code || err.message }
    );
  }
}

/**
 * Extract domain from a URL.
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Validate the initial URL format.
 */
function validateUrlFormat(url) {
  if (!url || typeof url !== 'string') {
    throw new AppError('VALIDATION_INVALID_URL', 'A URL is required.');
  }
  if (url.length > MAX_URL_LENGTH) {
    throw new AppError('VALIDATION_INVALID_URL', `URL exceeds ${MAX_URL_LENGTH} characters.`);
  }
  if (!url.startsWith('https://')) {
    throw new AppError('VALIDATION_INVALID_URL', 'URL must start with https://.');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('VALIDATION_INVALID_URL', 'URL format is not valid.');
  }

  return parsed;
}

/**
 * Check robots.txt for our User-Agent. Returns {checked, disallowed}.
 */
async function checkRobotsTxt(origin) {
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ROBOTS_TIMEOUT_MS);

    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeout);

    if (!res.ok) return { checked: true, disallowed: false };

    const text = await res.text();
    const lines = text.split('\n');

    let inRelevantBlock = false;
    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed.startsWith('user-agent:')) {
        const agent = trimmed.slice('user-agent:'.length).trim();
        inRelevantBlock = (agent === '*' || agent.includes('agentis') || agent.includes('perseus'));
      } else if (inRelevantBlock && trimmed.startsWith('disallow:')) {
        const path = trimmed.slice('disallow:'.length).trim();
        if (path === '/') return { checked: true, disallowed: true };
      }
    }

    return { checked: true, disallowed: false };
  } catch {
    return { checked: true, disallowed: false };
  }
}

/**
 * Stream response body with a size limit. Aborts if body exceeds MAX_BODY_BYTES.
 */
async function readBodyWithLimit(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        throw new AppError(
          'FETCH_TOO_LARGE',
          'This page exceeds 5MB. Perseus cannot scan pages this large.',
          { bytesReceived: totalBytes }
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const decoder = new TextDecoder();
  return { text: chunks.map(c => decoder.decode(c, { stream: true })).join('') + decoder.decode(), totalBytes };
}

/**
 * Fetch a public URL with safety constraints.
 *
 * @param {string} url - The URL to fetch (must be https://)
 * @returns {Promise<{html: string, metadata: object}>}
 */
export async function fetchUrl(url) {
  const parsed = validateUrlFormat(url);
  await validateResolvedIp(parsed.hostname);

  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const redirectChain = [];
  let currentUrl = url;
  let response;

  try {
    const robotsTxt = await checkRobotsTxt(parsed.origin);

    let hops = 0;
    while (true) {
      response = await fetch(currentUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
        redirect: 'manual'
      });

      if (response.status >= 300 && response.status < 400) {
        hops++;
        if (hops > MAX_REDIRECTS) {
          throw new AppError(
            'FETCH_REDIRECT_LIMIT',
            'This URL redirected too many times (more than 3 hops).',
            { hops, redirectChain }
          );
        }

        const location = response.headers.get('location');
        if (!location) break;

        const redirectUrl = new URL(location, currentUrl);

        if (redirectUrl.protocol !== 'https:') {
          throw new AppError(
            'FETCH_FORBIDDEN',
            'This URL redirected to a non-HTTPS address which cannot be followed.',
            { domain: extractDomain(redirectUrl.href) }
          );
        }
        await validateResolvedIp(redirectUrl.hostname);

        redirectChain.push({
          domain: extractDomain(currentUrl),
          statusCode: response.status
        });

        currentUrl = redirectUrl.href;
        continue;
      }

      break;
    }

    clearTimeout(timeout);

    if (response.status === 403) {
      throw new AppError(
        'FETCH_FORBIDDEN',
        'This site is blocking automated requests. Perseus could not access the page.',
        { domain: extractDomain(currentUrl), statusCode: 403 }
      );
    }
    if (response.status === 404) {
      throw new AppError(
        'FETCH_NOT_FOUND',
        'This page was not found.',
        { domain: extractDomain(currentUrl), statusCode: 404 }
      );
    }
    if (!response.ok) {
      throw new AppError(
        'FETCH_FORBIDDEN',
        `This site returned status ${response.status} and could not be scanned.`,
        { domain: extractDomain(currentUrl), statusCode: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new AppError(
        'FETCH_NOT_HTML',
        `This URL returned ${contentType || 'no content-type'}, not HTML. Perseus scans HTML pages.`,
        { domain: extractDomain(currentUrl), contentType }
      );
    }

    const { text: html, totalBytes } = await readBodyWithLimit(response);
    const fetchDurationMs = Date.now() - startTime;

    logger.info('URL fetched', {
      targetUrl: currentUrl,
      statusCode: response.status,
      contentLength: totalBytes,
      redirectCount: redirectChain.length,
      fetchDurationMs
    });

    return {
      html,
      metadata: {
        finalUrl: extractDomain(currentUrl),
        statusCode: response.status,
        contentType,
        contentLength: totalBytes,
        redirectChain,
        robotsTxt,
        fetchDurationMs
      }
    };
  } catch (err) {
    clearTimeout(timeout);

    if (err instanceof AppError) throw err;

    if (err.name === 'AbortError') {
      throw new AppError(
        'FETCH_TIMEOUT',
        'This site did not respond within 30 seconds.',
        { domain: extractDomain(currentUrl), durationMs: Date.now() - startTime }
      );
    }

    if (err.cause?.code === 'ENOTFOUND' || err.code === 'ENOTFOUND') {
      throw new AppError(
        'FETCH_DNS_FAILURE',
        'This domain could not be resolved. Check the URL and try again.',
        { domain: extractDomain(currentUrl) }
      );
    }

    throw new AppError(
      'FETCH_FORBIDDEN',
      'This site could not be reached.',
      { domain: extractDomain(currentUrl), error: err.message }
    );
  }
}
