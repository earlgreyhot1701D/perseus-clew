/**
 * Perseus Clew scan handler (Block 1E-c: real implementation).
 *
 * Replaces the Block 0 mock handler. Orchestrates the full URL scan pipeline:
 * validate -> rate-limit -> cache read -> fetch -> runScan -> generateHeroLine
 * -> fill meta -> respond -> async fail-soft DynamoDB write.
 *
 * repo and spec types are stubbed (501) pending their respective blocks.
 *
 * See BACKEND-FRONTEND-CHECKS.md section 8 for the response shape.
 */

import crypto from 'node:crypto';
import { checkRateLimit } from '../shared/rate-limit.js';
import { fetchUrl } from '../shared/fetch-url.js';
import { readCache, writeCache, writeResult } from '../shared/scan-store.js';
import { logger } from '../shared/logger.js';
import { AppError } from '../shared/errors.js';
import { runScan } from '../orchestrator/flow.js';
import { generateHeroLine } from '../orchestrator/hero-line.js';

const SCAN_TIMEOUT_MS = 45_000;

// --- URL normalization for cache key ---
// v1: sort params, strip fragment, lowercase scheme+host, strip trailing slash.
// NOTE: tracking params (utm_*, session tokens, etc.) are NOT stripped in v1.
// This means ?utm_source=a and =b produce separate cache entries. Acceptable for v1;
// a strip-list is a future refinement, not worth the complexity/risk now.

function normalizeUrlForCache(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = ''; // strip fragment
    // Sort query params alphabetically
    const params = new URLSearchParams(parsed.searchParams);
    const sorted = new URLSearchParams([...params.entries()].sort());
    parsed.search = sorted.toString() ? `?${sorted.toString()}` : '';
    // Lowercase scheme + host (URL constructor does this), strip trailing slash from path
    let normalized = parsed.toString();
    // Remove trailing slash only from path (not from bare domain)
    if (parsed.pathname !== '/' && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url; // if unparseable, use as-is
  }
}

function computeCacheKey(normalizedUrl) {
  return crypto.createHash('sha256').update(normalizedUrl).digest('hex');
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
}

// --- Error mapping ---

const FETCH_ERROR_MAP = {
  VALIDATION_INVALID_URL: { status: 400, code: 'INVALID_URL' },
  FETCH_DNS_FAILURE: { status: 422, code: 'DNS_FAILURE' },
  FETCH_TIMEOUT: { status: 504, code: 'SCAN_TIMEOUT' },
  FETCH_FORBIDDEN: { status: 403, code: 'SITE_BLOCKED' },
  FETCH_NOT_FOUND: { status: 404, code: 'PAGE_NOT_FOUND' },
  FETCH_NOT_HTML: { status: 422, code: 'NOT_HTML' },
  FETCH_TOO_LARGE: { status: 422, code: 'PAGE_TOO_LARGE' },
  FETCH_REDIRECT_LIMIT: { status: 422, code: 'REDIRECT_LIMIT' }
};

function mapFetchError(err) {
  if (err instanceof AppError && FETCH_ERROR_MAP[err.code]) {
    const mapped = FETCH_ERROR_MAP[err.code];
    return { status: mapped.status, error: mapped.code, message: err.userMessage };
  }
  // Rate limit
  if (err instanceof AppError && err.code === 'RATE_LIMIT_EXCEEDED') {
    return { status: 429, error: 'RATE_LIMIT', message: 'Too many requests. Please wait before scanning again.' };
  }
  // Unknown
  return { status: 500, error: 'INTERNAL_ERROR', message: 'An unexpected error occurred during the scan.' };
}

// --- Handler ---

export const handler = async (event) => {
  const startTime = Date.now();

  // --- Rate limit (front of the line) ---
  try {
    await checkRateLimit(event);
  } catch (err) {
    const mapped = mapFetchError(err);
    return jsonResponse(mapped.status, { error: mapped.error, message: mapped.message });
  }

  // --- Parse input ---
  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch {
    return jsonResponse(400, { error: 'INVALID_JSON', message: 'Request body must be valid JSON' });
  }

  const { type, target } = body;

  if (!type || !['url', 'repo', 'spec'].includes(type)) {
    return jsonResponse(400, { error: 'INVALID_TYPE', message: 'Scan type must be one of: url, repo, spec' });
  }

  if (!target) {
    return jsonResponse(400, { error: 'MISSING_TARGET', message: 'A scan target is required' });
  }

  // --- Repo and spec: stubbed (501) ---
  if (type === 'repo') {
    // STUB: fetch-repo.js exists (1A) but repo scan orchestration is a separate milestone.
    // See BUILD-PLAN.md Block 2B for the repo scanning path.
    return jsonResponse(501, { error: 'NOT_IMPLEMENTED', message: 'Repository scanning is not yet available.' });
  }
  if (type === 'spec') {
    // STUB: parse-spec.js exists (1A) but spec upload orchestration is a separate milestone.
    // See BUILD-PLAN.md Block 2C for the spec upload path.
    return jsonResponse(501, { error: 'NOT_IMPLEMENTED', message: 'Spec upload scanning is not yet available.' });
  }

  // --- URL scan path ---
  const domain = extractDomain(target);
  const requestId = crypto.randomUUID();
  const resultId = crypto.randomUUID();

  // --- Cache check (per-URL key) ---
  const normalizedUrl = normalizeUrlForCache(target);
  const urlHash = computeCacheKey(normalizedUrl);
  // HARD RULE: normalizedUrl is used ONLY to compute the hash. Never logged.

  try {
    const cached = await readCache(urlHash);
    if (cached && cached.result) {
      const cachedReport = cached.result;
      cachedReport.meta.requestId = requestId;
      cachedReport.meta.fromCache = true;

      logger.info('Scan served from cache', { domain, requestId });

      // Amendment 2: NO writes on cache hit
      return jsonResponse(200, cachedReport);
    }
  } catch {
    // Cache read failure is non-fatal; proceed with fresh scan
  }

  // --- Fetch + Scan + Hero (with 45s timeout, Confirmation B) ---
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

    let fetchResult;
    try {
      fetchResult = await fetchUrl(target);
    } catch (err) {
      clearTimeout(timeout);
      // Amendment 2: NO writes on fetch error
      const mapped = mapFetchError(err);
      logger.info('Scan fetch failed', { domain, requestId, errorCode: err?.code });
      return jsonResponse(mapped.status, { error: mapped.error, message: mapped.message });
    }

    clearTimeout(timeout);

    const { html, metadata: fetchMetadata } = fetchResult;

    // --- Build preScanFindings ---
    const preScanFindings = [];
    if (fetchMetadata.robotsTxt && fetchMetadata.robotsTxt.disallowed) {
      preScanFindings.push({
        type: 'robots_txt',
        message: 'robots.txt disallows automated access to this site. An agent visiting may also encounter access restrictions.'
      });
    }
    if (fetchMetadata.redirectChain && fetchMetadata.redirectChain.length > 0) {
      const hops = fetchMetadata.redirectChain.length;
      preScanFindings.push({
        type: 'redirect_chain',
        message: `This URL redirected through ${hops} ${hops === 1 ? 'hop' : 'hops'} before responding.`
      });
    }

    // --- Run deterministic scan ---
    const report = runScan(html, target, { preScanFindings });

    // --- Generate hero line (Bedrock, fail-soft) ---
    const heroLine = await generateHeroLine(
      report.scoredViews.rawHtml.score.total,
      report.scoredViews.rawHtml.score.rating,
      report.scoredViews.rawHtml.findings,
      domain
    );
    report.scoredViews.rawHtml.heroLine = heroLine;

    // --- Fill handler-owned meta (Confirmation A: UTC ISO for scannedAt) ---
    const now = new Date();
    report.meta.requestId = requestId;
    report.meta.resultId = resultId;
    report.meta.durationMs = Date.now() - startTime;
    report.meta.timestamp = now.toISOString();
    report.meta.scannedAt = now.toISOString(); // UTC ISO-8601, timezone-stable
    report.meta.fromCache = false;

    // --- Log (domain only, never full URL or normalizedUrl) ---
    logger.info('Scan completed', {
      domain,
      requestId,
      resultId,
      score: report.scoredViews.rawHtml.score.total,
      rating: report.scoredViews.rawHtml.score.rating,
      heroSource: heroLine.source,
      durationMs: report.meta.durationMs
    });

    // --- Respond first ---
    const response = jsonResponse(200, report);

    // --- Async fail-soft write (Amendment 2: only on success-on-miss) ---
    writeResult(
      resultId,
      domain,
      report.scoredViews.rawHtml.score.total,
      report.scoredViews.rawHtml.score.rating,
      heroLine.text,
      report.scoredViews.rawHtml.score.breakdown,
      report.scoredViews.rawHtml.findings
    );
    writeCache(urlHash, domain, report);

    return response;
  } catch (err) {
    // Catch-all for unexpected errors (scan module crash, timeout, etc.)
    if (err.name === 'AbortError') {
      logger.warn('Scan timeout', { domain, requestId, durationMs: Date.now() - startTime });
      return jsonResponse(504, { error: 'SCAN_TIMEOUT', message: 'The scan took too long to complete. Try again.' });
    }

    logger.error('Scan unexpected error', {
      domain,
      requestId,
      errorCode: err?.code,
      errorMessage: err?.message
    });

    // Amendment 2: NO writes on error
    const mapped = mapFetchError(err);
    return jsonResponse(mapped.status, { error: mapped.error, message: mapped.message });
  }
};

// --- Helpers ---

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
}
