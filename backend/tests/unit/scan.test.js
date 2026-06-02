import { describe, it, expect, vi } from 'vitest';

// Mock scan-store at the scan handler's layer (not the AWS SDK)
vi.mock('../../src/shared/scan-store.js', () => ({
  writeResult: vi.fn(),
  writeCache: vi.fn()
}));

// Mock logger so no stdout noise in tests
vi.mock('../../src/shared/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

const { handler } = await import('../../src/handlers/scan.js');

describe('Perseus Clew scan handler (Block 0 mock)', () => {
  it('returns 400 for missing type', async () => {
    const event = { body: JSON.stringify({ target: 'https://example.com' }) };
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('INVALID_TYPE');
  });

  it('returns 400 for missing target', async () => {
    const event = { body: JSON.stringify({ type: 'url' }) };
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('MISSING_TARGET');
  });

  it('returns 400 for invalid JSON', async () => {
    const event = { body: 'not json' };
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('INVALID_JSON');
  });

  it('returns 200 with mock report for valid URL scan', async () => {
    const event = { body: JSON.stringify({ type: 'url', target: 'https://example-shop.com' }) };
    const response = await handler(event);
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);

    // Meta shape
    expect(body.meta).toBeDefined();
    expect(body.meta.scanType).toBe('url');
    expect(body.meta.targetDomain).toBe('example-shop.com');
    expect(body.meta.resultId).toBeDefined();
    expect(body.meta.fromCache).toBe(false);

    // Render-mode guardrail: score nested under scoredViews.rawHtml
    expect(body.scoredViews).toBeDefined();
    expect(body.scoredViews.rawHtml).toBeDefined();
    expect(body.scoredViews.rawHtml.score.total).toBe(62);
    expect(body.scoredViews.rawHtml.score.rating).toBe('Partially Ready');

    // Hero line shape
    expect(body.scoredViews.rawHtml.heroLine.text).toBeDefined();
    expect(body.scoredViews.rawHtml.heroLine.source).toBe('template');

    // Findings shape
    expect(body.scoredViews.rawHtml.findings.semantic_html).toBeInstanceOf(Array);
    expect(body.scoredViews.rawHtml.findings.content_in_html).toBeInstanceOf(Array);

    // Simulation and benchmark unavailable in Block 0
    expect(body.simulation.available).toBe(false);
    expect(body.benchmark.available).toBe(false);
  });

  it('returns JSON content-type header', async () => {
    const event = { body: JSON.stringify({ type: 'url', target: 'https://example.com' }) };
    const response = await handler(event);
    expect(response.headers['content-type']).toBe('application/json');
  });

  it('produces deterministic structure across runs', async () => {
    const event = { body: JSON.stringify({ type: 'url', target: 'https://test.com' }) };
    const r1 = JSON.parse((await handler(event)).body);
    const r2 = JSON.parse((await handler(event)).body);

    // Structure is identical (UUIDs and timestamps differ)
    expect(r1.scoredViews.rawHtml.score.total).toBe(r2.scoredViews.rawHtml.score.total);
    expect(r1.scoredViews.rawHtml.score.rating).toBe(r2.scoredViews.rawHtml.score.rating);
    expect(r1.scoredViews.rawHtml.heroLine.text).toBe(r2.scoredViews.rawHtml.heroLine.text);
  });

  it('calls writeResult and writeCache after building the response', async () => {
    const { writeResult, writeCache } = await import('../../src/shared/scan-store.js');
    writeResult.mockClear();
    writeCache.mockClear();
    const event = { body: JSON.stringify({ type: 'url', target: 'https://example.com' }) };
    await handler(event);

    expect(writeResult).toHaveBeenCalledOnce();
    expect(writeCache).toHaveBeenCalledOnce();

    // writeResult receives the correct arguments
    const resultArgs = writeResult.mock.calls[0];
    expect(resultArgs[1]).toBe('example.com'); // domain
    expect(resultArgs[2]).toBe(62); // score
    expect(resultArgs[3]).toBe('Partially Ready'); // rating
  });
});
