/**
 * Perseus Clew: Tests for scan handler Promise.all resilience (1J fix #3).
 *
 * Proves that if generateHeroLine or runSimulation REJECTS (async, not sync),
 * the handler still returns 200 with the deterministic scan result + fallback
 * values. Tests must use async-rejecting mocks (the 1I lesson: sync throw
 * mocks would hide an async bug).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies of scan.js
vi.mock('../../src/shared/rate-limit.js', () => ({
  checkRateLimit: vi.fn(async () => {})
}));

vi.mock('../../src/shared/fetch-url.js', () => ({
  fetchUrl: vi.fn(async () => ({
    html: '<html><body><h1>Hello</h1></body></html>',
    metadata: { robotsTxt: null, redirectChain: [] }
  }))
}));

vi.mock('../../src/shared/scan-store.js', () => ({
  readCache: vi.fn(async () => null),
  writeCache: vi.fn(async () => {}),
  writeResult: vi.fn(async () => {})
}));

vi.mock('../../src/shared/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('../../src/orchestrator/flow.js', () => ({
  runScan: vi.fn(() => ({
    meta: {
      requestId: null, resultId: null, scanType: 'url',
      targetDomain: 'example.com', durationMs: null,
      timestamp: null, scannedAt: null, fromCache: false,
      methodologyVersion: '1.1.1'
    },
    preScanFindings: [],
    scoredViews: {
      rawHtml: {
        score: { total: 72, rating: 'Partially Ready', breakdown: {} },
        heroLine: { text: '', source: 'pending', model: null },
        findings: {}
      }
    },
    simulation: { available: false }
  }))
}));

vi.mock('../../src/orchestrator/hero-line.js', () => ({
  generateHeroLine: vi.fn(async () => ({
    text: 'An agent can read this page.',
    source: 'ai',
    model: 'claude-haiku-4-5-20251001'
  }))
}));

vi.mock('../../src/orchestrator/simulation.js', () => ({
  runSimulation: vi.fn(async () => ({
    available: true,
    tasks: [],
    source: 'ai',
    model: 'claude-haiku-4-5-20251001',
    durationMs: 1000
  }))
}));

import { handler } from '../../src/handlers/scan.js';
import { generateHeroLine } from '../../src/orchestrator/hero-line.js';
import { runSimulation } from '../../src/orchestrator/simulation.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to defaults
  generateHeroLine.mockResolvedValue({
    text: 'An agent can read this page.',
    source: 'ai',
    model: 'claude-haiku-4-5-20251001'
  });
  runSimulation.mockResolvedValue({
    available: true,
    tasks: [],
    source: 'ai',
    model: 'claude-haiku-4-5-20251001',
    durationMs: 1000
  });
});

function makeEvent(body) {
  return { body: JSON.stringify(body) };
}

describe('scan handler Promise.all resilience (1J #3)', () => {
  it('returns 200 with fallback hero when generateHeroLine REJECTS async', async () => {
    // Async rejection (not sync throw) — the real failure path
    generateHeroLine.mockRejectedValue(new Error('Bedrock exploded before internal catch'));

    const response = await handler(makeEvent({ type: 'url', target: 'https://example.com' }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    // Fallback hero: {text: '', source: 'template', model: null}
    expect(body.scoredViews.rawHtml.heroLine.source).toBe('template');
    expect(body.scoredViews.rawHtml.heroLine.model).toBeNull();
    // Deterministic score still present
    expect(body.scoredViews.rawHtml.score.total).toBe(72);
  });

  it('returns 200 with fallback simulation when runSimulation REJECTS async', async () => {
    // Async rejection
    runSimulation.mockRejectedValue(new Error('Simulation crashed before internal catch'));

    const response = await handler(makeEvent({ type: 'url', target: 'https://example.com' }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    // Fallback simulation: {available: false, reason: 'simulation-error'}
    expect(body.simulation.available).toBe(false);
    expect(body.simulation.reason).toBe('simulation-error');
    // Deterministic score still present
    expect(body.scoredViews.rawHtml.score.total).toBe(72);
  });

  it('returns 200 when BOTH hero and simulation REJECT async', async () => {
    generateHeroLine.mockRejectedValue(new Error('hero crash'));
    runSimulation.mockRejectedValue(new Error('sim crash'));

    const response = await handler(makeEvent({ type: 'url', target: 'https://example.com' }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.scoredViews.rawHtml.heroLine.source).toBe('template');
    expect(body.simulation.available).toBe(false);
    expect(body.scoredViews.rawHtml.score.total).toBe(72);
  });

  it('deterministic score and findings are preserved when AI layer rejects', async () => {
    generateHeroLine.mockRejectedValue(new Error('fail'));
    runSimulation.mockRejectedValue(new Error('fail'));

    const response = await handler(makeEvent({ type: 'url', target: 'https://example.com' }));

    const body = JSON.parse(response.body);
    expect(body.scoredViews.rawHtml.score.rating).toBe('Partially Ready');
    expect(body.meta.methodologyVersion).toBe('1.1.1');
    expect(body.meta.fromCache).toBe(false);
  });
});
