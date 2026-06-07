import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../../src/handlers/scan.js';
import { AppError } from '../../src/shared/errors.js';

// Mock all external dependencies
vi.mock('../../src/shared/rate-limit.js', () => ({
  checkRateLimit: vi.fn()
}));

vi.mock('../../src/shared/fetch-url.js', () => ({
  fetchUrl: vi.fn()
}));

vi.mock('../../src/shared/scan-store.js', () => ({
  readCache: vi.fn(),
  writeCache: vi.fn(),
  writeResult: vi.fn()
}));

vi.mock('../../src/shared/bedrock-client.js', () => ({
  invokeBedrock: vi.fn()
}));

vi.mock('../../src/shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { checkRateLimit } from '../../src/shared/rate-limit.js';
import { fetchUrl } from '../../src/shared/fetch-url.js';
import { readCache, writeCache, writeResult } from '../../src/shared/scan-store.js';
import { invokeBedrock } from '../../src/shared/bedrock-client.js';
import { logger } from '../../src/shared/logger.js';

// --- Fixture HTML ---

const fixtureHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Test Page</title>
  <meta property="og:title" content="Test">
  <meta property="og:description" content="Desc">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://example.com/i.jpg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Test">
  <meta name="twitter:description" content="Desc">
  <meta name="twitter:image" content="https://example.com/i.jpg">
  <link rel="canonical" href="https://example.com/page">
  <script type="application/ld+json">{"@type":"WebPage","name":"Test"}</script>
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main id="main">
    <h1>Test Page</h1>
    <h2>Section</h2>
    <p>This is a test page with enough content to pass the body text threshold
    check. It has more than two hundred characters of real text for the
    content-in-html check to pass successfully.</p>
    <form action="/go">
      <label for="q">Search</label>
      <input id="q" type="text" name="q">
      <button type="submit">Go</button>
    </form>
    <a href="/docs">Documentation</a>
  </main>
</body>
</html>`;

const fetchMetadata = {
  finalUrl: 'example.com',
  statusCode: 200,
  contentType: 'text/html',
  contentLength: fixtureHtml.length,
  redirectChain: [],
  robotsTxt: { checked: true, disallowed: false },
  fetchDurationMs: 500
};

// --- Helpers ---

function makeEvent(body) {
  return {
    body: JSON.stringify(body),
    requestContext: { http: { method: 'POST', sourceIp: '1.2.3.4' } }
  };
}

function parseBody(response) {
  return JSON.parse(response.body);
}

// Non-deterministic fields to strip for byte-stability comparison (Amendment 4)
const NON_DETERMINISTIC_FIELDS = ['requestId', 'resultId', 'durationMs', 'timestamp', 'scannedAt', 'fromCache'];

function stripNonDeterministic(report) {
  const clone = JSON.parse(JSON.stringify(report));
  for (const field of NON_DETERMINISTIC_FIELDS) {
    delete clone.meta[field];
  }
  return clone;
}

// --- Tests ---

describe('scan handler (1E-c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue(undefined);
    readCache.mockResolvedValue(null);
    fetchUrl.mockResolvedValue({ html: fixtureHtml, metadata: fetchMetadata });
    invokeBedrock.mockResolvedValue({
      text: 'An agent can read content and navigate links on this page.',
      modelId: 'claude-haiku-4-5-20251001',
      usage: { inputTokens: 50, outputTokens: 20 },
      durationMs: 300
    });
    writeResult.mockResolvedValue(undefined);
    writeCache.mockResolvedValue(undefined);
  });

  describe('full URL scan (happy path)', () => {
    it('returns 200 with complete report shape', async () => {
      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));
      expect(res.statusCode).toBe(200);

      const report = parseBody(res);
      expect(report).toHaveProperty('meta');
      expect(report).toHaveProperty('preScanFindings');
      expect(report).toHaveProperty('scoredViews.rawHtml.score');
      expect(report).toHaveProperty('scoredViews.rawHtml.heroLine');
      expect(report).toHaveProperty('scoredViews.rawHtml.findings');
      expect(report).toHaveProperty('simulation');
    });

    it('fills meta fields correctly', async () => {
      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));
      const report = parseBody(res);

      expect(report.meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(report.meta.resultId).toMatch(/^[0-9a-f-]{36}$/);
      expect(report.meta.scanType).toBe('url');
      expect(report.meta.targetDomain).toBe('example.com');
      expect(report.meta.fromCache).toBe(false);
      expect(report.meta.durationMs).toBeGreaterThan(0);
      expect(report.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.meta.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.meta.methodologyVersion).toBe('1.1.1');
    });

    it('heroLine is filled (not pending)', async () => {
      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));
      const report = parseBody(res);

      expect(report.scoredViews.rawHtml.heroLine.source).toBe('ai');
      expect(report.scoredViews.rawHtml.heroLine.text.length).toBeGreaterThan(0);
    });

    it('score is computed (not mock 62)', async () => {
      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));
      const report = parseBody(res);

      expect(typeof report.scoredViews.rawHtml.score.total).toBe('number');
      expect(report.scoredViews.rawHtml.score.total).not.toBe(62);
    });
  });

  describe('cache hit', () => {
    it('returns stored report with fromCache:true', async () => {
      const cachedReport = { meta: { resultId: 'cached-id', fromCache: false }, scoredViews: { rawHtml: { score: { total: 75 } } } };
      readCache.mockResolvedValue({ result: cachedReport });

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));
      const report = parseBody(res);

      expect(res.statusCode).toBe(200);
      expect(report.meta.fromCache).toBe(true);
      expect(report.meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('does NOT call fetchUrl or generateHeroLine', async () => {
      readCache.mockResolvedValue({ result: { meta: {}, scoredViews: { rawHtml: { score: { total: 80 } } } } });

      await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(fetchUrl).not.toHaveBeenCalled();
      expect(invokeBedrock).not.toHaveBeenCalled();
    });

    it('does NOT write to DynamoDB (Amendment 2)', async () => {
      readCache.mockResolvedValue({ result: { meta: {}, scoredViews: { rawHtml: { score: { total: 80 } } } } });

      await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(writeResult).not.toHaveBeenCalled();
      expect(writeCache).not.toHaveBeenCalled();
    });
  });

  describe('cache miss', () => {
    it('runs full pipeline and writes to DynamoDB', async () => {
      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(200);
      expect(fetchUrl).toHaveBeenCalled();
      expect(writeResult).toHaveBeenCalled();
      expect(writeCache).toHaveBeenCalled();
    });
  });

  describe('rate limit', () => {
    it('returns 429 on rate limit exceeded', async () => {
      checkRateLimit.mockRejectedValue(new AppError('RATE_LIMIT_EXCEEDED', 'Too many'));

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(429);
      expect(parseBody(res).error).toBe('RATE_LIMIT');
    });
  });

  describe('fetch error mapping', () => {
    it('SSRF rejection -> 400, generic message, no IP leaked', async () => {
      fetchUrl.mockRejectedValue(new AppError('VALIDATION_INVALID_URL', 'This URL points to a private or reserved address and cannot be scanned.'));

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(400);
      const body = parseBody(res);
      expect(body.error).toBe('INVALID_URL');
      expect(body.message).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    });

    it('fetch timeout -> 504', async () => {
      fetchUrl.mockRejectedValue(new AppError('FETCH_TIMEOUT', 'Timed out'));

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(504);
      expect(parseBody(res).error).toBe('SCAN_TIMEOUT');
    });

    it('403 blocked -> 403', async () => {
      fetchUrl.mockRejectedValue(new AppError('FETCH_FORBIDDEN', 'Blocked'));

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(403);
      expect(parseBody(res).error).toBe('SITE_BLOCKED');
    });

    it('404 -> 404', async () => {
      fetchUrl.mockRejectedValue(new AppError('FETCH_NOT_FOUND', 'Not found'));

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(404);
      expect(parseBody(res).error).toBe('PAGE_NOT_FOUND');
    });

    it('not HTML -> 422', async () => {
      fetchUrl.mockRejectedValue(new AppError('FETCH_NOT_HTML', 'Not HTML'));

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(422);
      expect(parseBody(res).error).toBe('NOT_HTML');
    });

    it('DNS failure -> 422', async () => {
      fetchUrl.mockRejectedValue(new AppError('FETCH_DNS_FAILURE', 'DNS failed'));

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(422);
      expect(parseBody(res).error).toBe('DNS_FAILURE');
    });

    it('fetch error does NOT write to DynamoDB (Amendment 2)', async () => {
      fetchUrl.mockRejectedValue(new AppError('FETCH_TIMEOUT', 'Timed out'));

      await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(writeResult).not.toHaveBeenCalled();
      expect(writeCache).not.toHaveBeenCalled();
    });
  });

  describe('robots.txt + redirect chain -> preScanFindings', () => {
    it('surfaces robots.txt disallow as preScanFinding', async () => {
      fetchUrl.mockResolvedValue({
        html: fixtureHtml,
        metadata: { ...fetchMetadata, robotsTxt: { checked: true, disallowed: true } }
      });

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));
      const report = parseBody(res);

      const robotsFinding = report.preScanFindings.find(f => f.type === 'robots_txt');
      expect(robotsFinding).toBeDefined();
      expect(robotsFinding.message).toContain('agent visiting');
    });

    it('surfaces redirect chain as preScanFinding', async () => {
      fetchUrl.mockResolvedValue({
        html: fixtureHtml,
        metadata: { ...fetchMetadata, redirectChain: ['https://example.com/old', 'https://example.com/new'] }
      });

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));
      const report = parseBody(res);

      const redirectFinding = report.preScanFindings.find(f => f.type === 'redirect_chain');
      expect(redirectFinding).toBeDefined();
      expect(redirectFinding.message).toContain('2 hops');
    });
  });

  describe('fail-soft write', () => {
    it('returns 200 + report even when writes reject (async)', async () => {
      writeResult.mockRejectedValue(new Error('DynamoDB down'));
      writeCache.mockRejectedValue(new Error('DynamoDB down'));

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(200);
      const report = parseBody(res);
      expect(report.scoredViews.rawHtml.score.total).toBeGreaterThanOrEqual(0);
    });

    it('returns 200 + report even when writeResult throws synchronously (F-1)', async () => {
      writeResult.mockImplementation(() => { throw new Error('sync kaboom'); });
      writeCache.mockResolvedValue(undefined);

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(200);
      const report = parseBody(res);
      expect(report.scoredViews.rawHtml.score.total).toBeGreaterThanOrEqual(0);
    });

    it('returns 200 + report even when writeCache throws synchronously (F-1)', async () => {
      writeResult.mockResolvedValue(undefined);
      writeCache.mockImplementation(() => { throw new Error('sync kaboom'); });

      const res = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      expect(res.statusCode).toBe(200);
      const report = parseBody(res);
      expect(report.scoredViews.rawHtml.score.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('repo/spec stubs', () => {
    it('repo -> 501 NOT_IMPLEMENTED', async () => {
      const res = await handler(makeEvent({ type: 'repo', target: 'owner/repo' }));
      expect(res.statusCode).toBe(501);
      expect(parseBody(res).error).toBe('NOT_IMPLEMENTED');
    });

    it('spec -> 501 NOT_IMPLEMENTED', async () => {
      const res = await handler(makeEvent({ type: 'spec', target: 'openapi content' }));
      expect(res.statusCode).toBe(501);
      expect(parseBody(res).error).toBe('NOT_IMPLEMENTED');
    });
  });

  describe('input validation', () => {
    it('invalid JSON -> 400', async () => {
      const res = await handler({ body: 'not json', requestContext: { http: { sourceIp: '1.2.3.4' } } });
      expect(res.statusCode).toBe(400);
      expect(parseBody(res).error).toBe('INVALID_JSON');
    });

    it('missing type -> 400', async () => {
      const res = await handler(makeEvent({ target: 'https://example.com' }));
      expect(res.statusCode).toBe(400);
      expect(parseBody(res).error).toBe('INVALID_TYPE');
    });

    it('missing target -> 400', async () => {
      const res = await handler(makeEvent({ type: 'url' }));
      expect(res.statusCode).toBe(400);
      expect(parseBody(res).error).toBe('MISSING_TARGET');
    });
  });

  describe('cache key is per-URL (L1A-4 fix)', () => {
    it('different paths on same domain produce different cache keys', async () => {
      await handler(makeEvent({ type: 'url', target: 'https://example.com/pageA' }));
      const firstCacheKey = readCache.mock.calls[0][0];

      vi.clearAllMocks();
      readCache.mockResolvedValue(null);
      fetchUrl.mockResolvedValue({ html: fixtureHtml, metadata: fetchMetadata });
      invokeBedrock.mockResolvedValue({ text: 'Line.', modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100 });

      await handler(makeEvent({ type: 'url', target: 'https://example.com/pageB' }));
      const secondCacheKey = readCache.mock.calls[0][0];

      expect(firstCacheKey).not.toBe(secondCacheKey);
    });

    it('same URL with different fragment produces same cache key', async () => {
      await handler(makeEvent({ type: 'url', target: 'https://example.com/page#section1' }));
      const firstKey = readCache.mock.calls[0][0];

      vi.clearAllMocks();
      readCache.mockResolvedValue(null);
      fetchUrl.mockResolvedValue({ html: fixtureHtml, metadata: fetchMetadata });
      invokeBedrock.mockResolvedValue({ text: 'Line.', modelId: 'claude-haiku-4-5-20251001', usage: {}, durationMs: 100 });

      await handler(makeEvent({ type: 'url', target: 'https://example.com/page#section2' }));
      const secondKey = readCache.mock.calls[0][0];

      expect(firstKey).toBe(secondKey);
    });
  });

  describe('logging: domain only (Amendment 3)', () => {
    it('logger never receives the full URL or normalizedUrl', async () => {
      await handler(makeEvent({ type: 'url', target: 'https://example.com/secret-path?token=abc123' }));

      for (const call of [...logger.info.mock.calls, ...logger.warn.mock.calls]) {
        const logStr = JSON.stringify(call);
        expect(logStr).not.toContain('/secret-path');
        expect(logStr).not.toContain('token=abc123');
      }
    });
  });

  describe('determinism of the core (Amendment 4)', () => {
    it('deterministic fields are byte-stable across runs', async () => {
      const res1 = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));
      const res2 = await handler(makeEvent({ type: 'url', target: 'https://example.com/page' }));

      const report1 = stripNonDeterministic(parseBody(res1));
      const report2 = stripNonDeterministic(parseBody(res2));

      expect(report1).toEqual(report2);
    });
  });
});
