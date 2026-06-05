/**
 * Perseus Clew: Rate limiter.
 *
 * In-memory sliding window rate limiting per Lambda instance.
 * Defense in depth: API Gateway is the authoritative limit.
 * This catches burst patterns within a single container.
 *
 * See BACKEND-SHARED.md section 8.
 */

import { AppError } from './errors.js';
import { logger } from './logger.js';

const PER_IP_LIMIT = 10;
const GLOBAL_LIMIT = 1000;
const WINDOW_MS = 60 * 1000; // 60 seconds

// Module-level stores. Reset on Lambda cold start (new container = fresh store).
const ipStore = new Map();
const globalStore = [];

// Clock injection for testability. Production uses Date.now().
let now = () => Date.now();

/**
 * Test-only: override the clock function.
 * @param {() => number} fn - Function returning current time in ms
 */
export function _setNow(fn) {
  now = fn;
}

/**
 * Test-only: reset all stored state (between tests).
 */
export function _reset() {
  ipStore.clear();
  globalStore.length = 0;
}

/**
 * Prune entries older than the window from an array (in place).
 * O(n) filter: fine at current limits (max ~1000 entries).
 */
function prune(store, cutoff) {
  let writeIdx = 0;
  for (let i = 0; i < store.length; i++) {
    if (store[i] > cutoff) {
      store[writeIdx++] = store[i];
    }
  }
  store.length = writeIdx;
}

/**
 * Compute retryAfterSeconds from the oldest entry in a window.
 * Returns the number of seconds until the oldest entry ages out.
 */
function computeRetryAfter(store, currentTime) {
  if (store.length === 0) return 1;
  const oldest = store[0];
  const retryMs = WINDOW_MS - (currentTime - oldest);
  return Math.max(1, Math.ceil(retryMs / 1000));
}

/**
 * Extract source IP from a Lambda event.
 */
function extractIp(event) {
  if (event?.requestContext?.http?.sourceIp) {
    return event.requestContext.http.sourceIp;
  }
  if (event?.requestContext?.identity?.sourceIp) {
    return event.requestContext.identity.sourceIp;
  }
  return 'unknown';
}

/**
 * Check rate limit for an incoming request.
 * Returns void if under limit. Throws RATE_LIMIT_EXCEEDED if over.
 *
 * Hard invariant: prune -> check global -> check per-IP -> record.
 * A rejected request NEVER leaves a timestamp in the stores.
 *
 * @param {object} event - Lambda event object
 */
export async function checkRateLimit(event) {
  // Bypass for local dev and tests
  if (process.env.RATE_LIMIT_BYPASS === 'true') {
    return;
  }

  const currentTime = now();
  const cutoff = currentTime - WINDOW_MS;
  const ip = extractIp(event);

  // Prune expired entries
  prune(globalStore, cutoff);
  if (!ipStore.has(ip)) {
    ipStore.set(ip, []);
  }
  const ipEntries = ipStore.get(ip);
  prune(ipEntries, cutoff);

  // Check global limit first
  if (globalStore.length >= GLOBAL_LIMIT) {
    const retryAfterSeconds = computeRetryAfter(globalStore, currentTime);

    logger.warn('Global rate limit exceeded', {
      ip,
      globalCount: globalStore.length,
      retryAfterSeconds
    });

    const err = new AppError(
      'RATE_LIMIT_EXCEEDED',
      `Too many scans recently. Try again in ${retryAfterSeconds} seconds.`,
      { retryAfterSeconds, sourceIp: '[redacted]' }
    );
    err.retryAfterSeconds = retryAfterSeconds;
    throw err;
  }

  // Check per-IP limit
  if (ipEntries.length >= PER_IP_LIMIT) {
    const retryAfterSeconds = computeRetryAfter(ipEntries, currentTime);

    logger.warn('Per-IP rate limit exceeded', {
      ip,
      ipCount: ipEntries.length,
      retryAfterSeconds
    });

    const err = new AppError(
      'RATE_LIMIT_EXCEEDED',
      `Too many scans recently. Try again in ${retryAfterSeconds} seconds.`,
      { retryAfterSeconds, sourceIp: '[redacted]' }
    );
    err.retryAfterSeconds = retryAfterSeconds;
    throw err;
  }

  // Both checks passed: record the request
  globalStore.push(currentTime);
  ipEntries.push(currentTime);
}
