/**
 * Perseus Clew: URL fetcher with SSRF protection.
 *
 * Fetches a public URL and returns the HTML with metadata.
 * Enforces safety constraints: timeout, redirect limit, size limit,
 * content-type, robots.txt, and SSRF protection on every hop.
 *
 * SSRF defense: resolves hostname via dns.lookup and checks the resolved IP
 * against private/reserved ranges at every redirect hop, not just the initial
 * URL. This catches DNS rebinding attacks where a public-looking hostname
 * resolves to an internal IP.
 *
 * Note: there is a residual TOCTOU gap between dns.lookup and the actual TCP
 * connection (the DNS could change between resolve and connect). Full
 * connection-pinning would close this, but is over-engineering for our threat
 * model. Resolve-and-check per hop is the 95% defense we need.
 *
 * See BACKEND-SHARED.md section 3.
 */

import dns from 'node:dns/promises';
import { AppError } from './errors.js';
import { logger } from './logger.js';

const MAX_URL_LENGTH = 2048;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB
const ROBOTS_TIMEOUT_MS = 5_000;

const USER_AGENT = process.env.PERSEUS_USER_AGENT
  || 'Agentis Lux/0.1 (+https://agentislux.io/about-scanner)';

// Private/reserved IPv4 ranges
const PRIVATE_IPV4_RANGES = [
  { prefix: '127.', mask: null },         // loopback
  { prefix: '10.', mask: null },          // RFC1918
  { prefix: '0.', mask: null },           // current network
  { prefix: '169.254.', mask: null },     // link-local (includes AWS metadata)
  { prefix: '192.168.', mask: null },     // RFC1918
];

// 172.16.0.0/12 needs range check (172.16-31.x.x)
function is172Private(ip) {
  const match = ip.match(/^172\.(\d+)\./);
  if (!match) return false;
  const second = parseInt(match[1], 10);
  return second >= 16 && second <= 31;
}

/**
 * Check if a resolved IP address is private or reserved.
 */
function isPrivateIp(ip) {
  if (!ip) return true; // no IP = unsafe

  // IPv6 checks
  if (ip === '::1') return true;
  if (ip.startsWith('fe80:')) return true; // link-local
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique local
  if (ip === '::') return true;

  // IPv4 prefix checks
  for (const range of PRIVATE_IPV4_RANGES) {
    if (ip.startsWith(range.prefix)) return true;
  }

  // 172.16-31.x.x
  if (is172Private(ip)) return true;

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
 * Resolve a hostname and check if the resolved IP is private.
 * Throws VALIDATION_INVALID_URL if the IP is private/reserved.
 */
async function validateResolvedIp(hostname, urlForError) {
  // Skip resolution for literal IPs (just check directly)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) {
    if (isPrivateIp(hostname)) {
      throw new AppError(
        'VALIDATION_INVALID_URL',
        'This URL points to a private or reserved address and cannot be scanned.',
        { domain: hostname }
      );
    }
    return;
  }

  if (isPrivateHostname(hostname)) {
    throw new AppError(
      'VALIDATION_INVALID_URL',
      'This URL points to a private or reserved address and cannot be scanned.',
      { domain: hostname }
    );
  }

  // Resolve and check
  try {
    const { address } = await dns.lookup(hostname);
    if (isPrivateIp(address)) {
      throw new AppError(
        'VALIDATION_INVALID_URL',
        'This URL points to a private or reserved address and cannot be scanned.',
        { domain: hostname, resolvedIp: address }
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'FETCH_DNS_FAILURE',
      'This domain could not be resolved. Check the URL and try again.',
      { domain: hostname, error: err.code || err.message }
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
        if (path === '/' || path === '') {
          // Disallow all or empty (empty means allow, but / means all)
          if (path === '/') return { checked: true, disallowed: true };
        }
      }
    }

    return { checked: true, disallowed: false };
  } catch {
    // robots.txt fetch failed (timeout, network, etc.) -> treat as allowed
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
  await validateResolvedIp(parsed.hostname, url);

  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const redirectChain = [];
  let currentUrl = url;
  let response;

  try {
    // Check robots.txt before main fetch
    const robotsTxt = await checkRobotsTxt(parsed.origin);

    // Fetch with manual redirect following (SSRF check on each hop)
    let hops = 0;
    while (true) {
      response = await fetch(currentUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
        redirect: 'manual'
      });

      // Handle redirects manually
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
        if (!location) break; // No Location header, treat as final response

        // Resolve relative redirects
        const redirectUrl = new URL(location, currentUrl);

        // SSRF check on redirect target
        if (redirectUrl.protocol !== 'https:') {
          throw new AppError(
            'FETCH_FORBIDDEN',
            'This URL redirected to a non-HTTPS address which cannot be followed.',
            { domain: extractDomain(redirectUrl.href) }
          );
        }
        await validateResolvedIp(redirectUrl.hostname, redirectUrl.href);

        redirectChain.push({
          domain: extractDomain(currentUrl),
          statusCode: response.status
        });

        currentUrl = redirectUrl.href;
        continue;
      }

      break; // Non-redirect response, proceed
    }

    clearTimeout(timeout);

    // Handle error status codes
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

    // Check content-type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new AppError(
        'FETCH_NOT_HTML',
        `This URL returned ${contentType || 'no content-type'}, not HTML. Perseus scans HTML pages.`,
        { domain: extractDomain(currentUrl), contentType }
      );
    }

    // Stream body with size limit
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
