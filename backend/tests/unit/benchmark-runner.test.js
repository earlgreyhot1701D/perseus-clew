/**
 * Perseus Clew: Benchmark runner unit tests.
 *
 * Mocks all I/O (fetchUrl, fetchSpecUrl, Bedrock calls, DynamoDB writes).
 * Verifies orchestration: iteration, dual-spec for SaaS, three shapes,
 * per-site isolation, pacing, and summary counts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing runner
vi.mock('../../src/shared/fetch-url.js', () => ({
  fetchUrl: vi.fn()
}));

vi.mock('../../src/benchmark/fetch-spec-url.js', () => ({
  fetchSpecUrl: vi.fn()
}));

vi.mock('../../src/orchestrator/flow.js', () => ({
  runScan: vi.fn()
}));

vi.mock('../../src/orchestrator/api-flow.js', () => ({
  runApiScan: vi.fn()
}));

vi.mock('../../src/orchestrator/hero-line.js', () => ({
  generateHeroLine: vi.fn()
}));

vi.mock('../../src/orchestrator/simulation.js', () => ({
  runSimulation: vi.fn()
}));

vi.mock('../../src/benchmark/benchmark-store.js', () => ({
  writeBenchmarkResult: vi.fn()
}));

vi.mock('../../src/shared/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { runBenchmark, _setSleep } from '../../src/benchmark/runner.js';
import { fetchUrl } from '../../src/shared/fetch-url.js';
import { fetchSpecUrl } from '../../src/benchmark/fetch-spec-url.js';
import { runScan } from '../../src/orchestrator/flow.js';
import { runApiScan } from '../../src/orchestrator/api-flow.js';
import { generateHeroLine } from '../../src/orchestrator/hero-line.js';
import { runSimulation } from '../../src/orchestrator/simulation.js';
import { writeBenchmarkResult } from '../../src/benchmark/benchmark-store.js';
import { BENCHMARK_SITES } from '../../src/benchmark/sites.js';

// --- Fixtures ---

function makeFrontendReport(score = 72, rating = 'Partially Ready') {
  return {
    scoredViews: {
      rawHtml: {
        score: {
          total: score,
          rating,
          breakdown: { semantic_html: { score: 80, weight: 25 } }
        },
        findings: {
          semantic_html: [{ id: 'sem-1', text: 'An agent cannot identify the main navigation.', count: 1 }]
        }
      }
    }
  };
}

function makeApiResultNormal(score = 85, rating = 'Agent-Ready') {
  return {
    error: false,
    meta: { scanType: 'spec', endpointCount: 42 },
    scoredViews: {
      api: {
        score: { total: score, rating, breakdown: { naming_descriptions: { score: 90, weight: 25 } } },
        findings: { naming_descriptions: [{ id: 'nd-1', text: 'An agent cannot distinguish operation purposes.', count: 3 }] }
      }
    }
  };
}

function makeApiResultNotEvaluable() {
  return {
    error: false,
    meta: { scanType: 'spec', endpointCount: 0 },
    scoredViews: {
      api: {
        score: { total: null, rating: 'Not Evaluable', breakdown: {} },
        findings: {}
      }
    }
  };
}

function makeApiResultError() {
  return {
    error: true,
    code: 'PARSE_INVALID_SPEC',
    message: 'The spec could not be parsed.'
  };
}

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks();
  _setSleep(() => Promise.resolve()); // No real delays in tests

  // Default happy-path mocks
  fetchUrl.mockResolvedValue({ html: '<html><body>Hello</body></html>', metadata: {} });
  fetchSpecUrl.mockResolvedValue({ text: '{"openapi":"3.0.0","paths":{}}', contentType: 'application/json', sizeBytes: 100 });
  runScan.mockReturnValue(makeFrontendReport());
  runApiScan.mockResolvedValue(makeApiResultNormal());
  generateHeroLine.mockResolvedValue({ text: 'An agent can read content on this page.', source: 'ai', model: 'claude-haiku-4-5' });
  runSimulation.mockResolvedValue({ available: true, tasks: [{ id: 't1', text: 'Navigate to checkout' }], source: 'ai', model: 'claude-haiku-4-5' });
  writeBenchmarkResult.mockResolvedValue(undefined);
});

// --- Tests ---

describe('Benchmark runner', () => {
  describe('Site manifest', () => {
    it('contains exactly 50 sites', () => {
      expect(BENCHMARK_SITES).toHaveLength(50);
    });

    it('has 10 sites per vertical', () => {
      const verticals = {};
      for (const site of BENCHMARK_SITES) {
        verticals[site.vertical] = (verticals[site.vertical] || 0) + 1;
      }
      expect(verticals.ecommerce).toBe(10);
      expect(verticals.saas).toBe(10);
      expect(verticals.content).toBe(10);
      expect(verticals.government).toBe(10);
      expect(verticals.indie).toBe(10);
    });

    it('SaaS sites all have referenceSpecUrl', () => {
      const saas = BENCHMARK_SITES.filter(s => s.vertical === 'saas');
      for (const site of saas) {
        expect(site.referenceSpecUrl).toBeTruthy();
      }
    });

    it('non-SaaS sites have referenceSpecUrl: null', () => {
      const nonSaas = BENCHMARK_SITES.filter(s => s.vertical !== 'saas');
      for (const site of nonSaas) {
        expect(site.referenceSpecUrl).toBeNull();
      }
    });
  });

  describe('Orchestration', () => {
    it('iterates all sites when no subset specified', async () => {
      const summary = await runBenchmark();
      // 50 door scans + 10 reference scans = 60 total writes
      expect(writeBenchmarkResult).toHaveBeenCalledTimes(60);
      expect(summary.totalSites).toBe(50);
    });

    it('runs subset when siteIds provided', async () => {
      const summary = await runBenchmark({ siteIds: ['stripe', 'dan-luu'] });
      // stripe: door + reference = 2, dan-luu: door only = 1 -> 3 writes
      expect(writeBenchmarkResult).toHaveBeenCalledTimes(3);
      expect(summary.totalSites).toBe(2);
    });

    it('SaaS sites get two scans (door + reference)', async () => {
      await runBenchmark({ siteIds: ['stripe'] });
      const calls = writeBenchmarkResult.mock.calls;
      expect(calls).toHaveLength(2);

      const doorResult = calls[0][0];
      const refResult = calls[1][0];

      expect(doorResult.scanMode).toBe('door');
      expect(doorResult.siteId).toBe('stripe');
      expect(refResult.scanMode).toBe('reference');
      expect(refResult.siteId).toBe('stripe');
    });

    it('non-SaaS sites get one scan (door only)', async () => {
      await runBenchmark({ siteIds: ['dan-luu'] });
      const calls = writeBenchmarkResult.mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0].scanMode).toBe('door');
    });

    it('returns a batchRunId in the summary', async () => {
      const summary = await runBenchmark({ siteIds: ['dan-luu'] });
      expect(summary.batchRunId).toMatch(/^run-\d{4}-\d{2}-\d{2}-[a-f0-9]{8}$/);
    });
  });

  describe('Door scan results', () => {
    it('stores full findings (not just count)', async () => {
      await runBenchmark({ siteIds: ['dan-luu'] });
      const result = writeBenchmarkResult.mock.calls[0][0];

      expect(result.findings).toBeDefined();
      expect(result.findings.semantic_html).toBeInstanceOf(Array);
      expect(result.findings.semantic_html[0].text).toBe('An agent cannot identify the main navigation.');
      expect(result.findingsCount).toBe(1);
    });

    it('stores hero line and simulation', async () => {
      await runBenchmark({ siteIds: ['dan-luu'] });
      const result = writeBenchmarkResult.mock.calls[0][0];

      expect(result.heroLine.source).toBe('ai');
      expect(result.simulation.available).toBe(true);
    });

    it('stores frontend score, rating, breakdown', async () => {
      await runBenchmark({ siteIds: ['dan-luu'] });
      const result = writeBenchmarkResult.mock.calls[0][0];

      expect(result.frontendScore).toBe(72);
      expect(result.frontendRating).toBe('Partially Ready');
      expect(result.frontendBreakdown).toBeDefined();
    });

    it('door scan has apiScore: null (no door-side auto-discovery)', async () => {
      await runBenchmark({ siteIds: ['stripe'] });
      const doorResult = writeBenchmarkResult.mock.calls[0][0];
      expect(doorResult.apiScore).toBeNull();
      expect(doorResult.apiRating).toBeNull();
    });
  });

  describe('Three API return shapes', () => {
    it('persists normal score correctly', async () => {
      runApiScan.mockResolvedValue(makeApiResultNormal(85, 'Agent-Ready'));
      await runBenchmark({ siteIds: ['stripe'] });

      const refResult = writeBenchmarkResult.mock.calls[1][0];
      expect(refResult.scanMode).toBe('reference');
      expect(refResult.status).toBe('success');
      expect(refResult.apiScore).toBe(85);
      expect(refResult.apiRating).toBe('Agent-Ready');
      expect(refResult.apiBreakdown).toBeDefined();
      expect(refResult.apiFindings).toBeDefined();
      expect(refResult.apiError).toBeNull();
    });

    it('reference row includes specMeta (endpointCount, specTitle, specVersion)', async () => {
      runApiScan.mockResolvedValue(makeApiResultNormal(85, 'Agent-Ready'));
      await runBenchmark({ siteIds: ['stripe'] });

      const refResult = writeBenchmarkResult.mock.calls[1][0];
      expect(refResult.specMeta).toEqual({
        endpointCount: 42,
        specTitle: null,
        specVersion: null
      });
    });

    it('persists Not Evaluable correctly (not as zero or 100)', async () => {
      runApiScan.mockResolvedValue(makeApiResultNotEvaluable());
      await runBenchmark({ siteIds: ['stripe'] });

      const refResult = writeBenchmarkResult.mock.calls[1][0];
      expect(refResult.status).toBe('not-evaluable');
      expect(refResult.apiScore).toBeNull();
      expect(refResult.apiRating).toBe('Not Evaluable');
      expect(refResult.apiError).toBeNull();
    });

    it('persists error shape correctly (not as zero or crash)', async () => {
      runApiScan.mockResolvedValue(makeApiResultError());
      await runBenchmark({ siteIds: ['stripe'] });

      const refResult = writeBenchmarkResult.mock.calls[1][0];
      expect(refResult.status).toBe('failed');
      expect(refResult.apiScore).toBeNull();
      expect(refResult.apiRating).toBeNull();
      expect(refResult.apiError).toEqual({ code: 'PARSE_INVALID_SPEC', message: 'The spec could not be parsed.' });
    });
  });

  describe('Per-site failure isolation', () => {
    it('a failing site records failure and batch continues', async () => {
      // Make fetchUrl fail for the first call only
      fetchUrl
        .mockRejectedValueOnce({ code: 'FETCH_FORBIDDEN', message: 'This site is blocking automated requests.' })
        .mockResolvedValue({ html: '<html><body>OK</body></html>', metadata: {} });

      const summary = await runBenchmark({ siteIds: ['amazon', 'dan-luu'] });

      // Both sites attempted, one failed, one succeeded
      expect(summary.failed).toBe(1);
      expect(summary.completed).toBe(1);

      // The failed result is recorded (not discarded)
      const failedResult = writeBenchmarkResult.mock.calls[0][0];
      expect(failedResult.siteId).toBe('amazon');
      expect(failedResult.status).toBe('failed');
      expect(failedResult.failureReason).toBe('FETCH_FORBIDDEN');
      expect(failedResult.frontendScore).toBeNull();
    });

    it('reference scan failure does not kill door scan for same site', async () => {
      fetchSpecUrl.mockRejectedValue({ code: 'FETCH_SPEC_TIMEOUT', message: 'Timed out.' });

      await runBenchmark({ siteIds: ['stripe'] });
      const calls = writeBenchmarkResult.mock.calls;

      // Door scan should still succeed
      const doorResult = calls[0][0];
      expect(doorResult.scanMode).toBe('door');
      expect(doorResult.status).toBe('success');

      // Reference scan should be recorded as failed
      const refResult = calls[1][0];
      expect(refResult.scanMode).toBe('reference');
      expect(refResult.status).toBe('failed');
      expect(refResult.failureReason).toBe('FETCH_SPEC_TIMEOUT');
    });

    it('Bedrock failures fall back gracefully (hero to template, sim to unavailable)', async () => {
      generateHeroLine.mockRejectedValue(new Error('throttled'));
      runSimulation.mockRejectedValue(new Error('throttled'));

      await runBenchmark({ siteIds: ['dan-luu'] });
      const result = writeBenchmarkResult.mock.calls[0][0];

      // Door scan still succeeds (deterministic score is not Bedrock-dependent)
      expect(result.status).toBe('success');
      expect(result.frontendScore).toBe(72);
      // Hero falls back to template
      expect(result.heroLine).toEqual({ text: '', source: 'template', model: null });
      // Simulation falls back to unavailable
      expect(result.simulation).toEqual({ available: false, reason: 'simulation-error' });
    });

    it('fallback counter is included in summary', async () => {
      generateHeroLine.mockRejectedValue(new Error('throttled'));
      runSimulation.mockRejectedValue(new Error('throttled'));

      const summary = await runBenchmark({ siteIds: ['dan-luu', 'julia-evans'] });

      // 2 sites x 2 Bedrock calls each = 4 fallbacks
      expect(summary.bedrockFallbacks).toBe(4);
    });

    it('fallback marker is not persisted to DynamoDB', async () => {
      generateHeroLine.mockRejectedValue(new Error('throttled'));

      await runBenchmark({ siteIds: ['dan-luu'] });
      const result = writeBenchmarkResult.mock.calls[0][0];

      expect(result._bedrockFallbacks).toBeUndefined();
    });
  });

  describe('Pacing', () => {
    it('defaults to concurrency 3 and 2000ms delay when env vars unset', async () => {
      // Env vars are not set in test environment, so defaults apply.
      // The concurrency test below verifies max 3 concurrent.
      // This test confirms the summary works with defaults (no crash from NaN).
      const summary = await runBenchmark({ siteIds: ['dan-luu'] });
      expect(summary.completed).toBe(1);
    });

    it('processes sites in batches of 3 (no more than 3 concurrent)', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      fetchUrl.mockImplementation(async () => {
        currentConcurrent++;
        if (currentConcurrent > maxConcurrent) {
          maxConcurrent = currentConcurrent;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
        currentConcurrent--;
        return { html: '<html><body>OK</body></html>', metadata: {} };
      });

      // Use 9 non-SaaS sites to test batching (3 batches of 3)
      const nineIds = BENCHMARK_SITES
        .filter(s => s.vertical !== 'saas')
        .slice(0, 9)
        .map(s => s.siteId);

      await runBenchmark({ siteIds: nineIds });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });

  describe('Record schema', () => {
    it('door result contains all required fields', async () => {
      await runBenchmark({ siteIds: ['dan-luu'] });
      const result = writeBenchmarkResult.mock.calls[0][0];

      const requiredKeys = [
        'siteId', 'scanTimestamp', 'vertical', 'scanDate', 'scanMode',
        'status', 'failureReason', 'failureMessage',
        'frontendScore', 'frontendRating', 'frontendBreakdown',
        'findings', 'findingsCount', 'heroLine', 'simulation',
        'apiScore', 'apiRating', 'apiBreakdown', 'apiFindings', 'apiError',
        'durationMs', 'methodologyVersion', 'batchRunId'
      ];

      for (const key of requiredKeys) {
        expect(result).toHaveProperty(key);
      }
    });

    it('scanTimestamp uses door# prefix for door scans', async () => {
      await runBenchmark({ siteIds: ['dan-luu'] });
      const result = writeBenchmarkResult.mock.calls[0][0];
      expect(result.scanTimestamp).toMatch(/^door#\d{4}-\d{2}-\d{2}T/);
    });

    it('scanTimestamp uses reference# prefix for reference scans', async () => {
      await runBenchmark({ siteIds: ['stripe'] });
      const refResult = writeBenchmarkResult.mock.calls[1][0];
      expect(refResult.scanTimestamp).toMatch(/^reference#\d{4}-\d{2}-\d{2}T/);
    });

    it('scanDate is YYYY-MM-DD format', async () => {
      await runBenchmark({ siteIds: ['dan-luu'] });
      const result = writeBenchmarkResult.mock.calls[0][0];
      expect(result.scanDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('batchRunId ties results to one invocation', async () => {
      await runBenchmark({ siteIds: ['stripe', 'dan-luu'] });
      const calls = writeBenchmarkResult.mock.calls;
      const runIds = calls.map(c => c[0].batchRunId);
      // All results from one run share the same batchRunId
      expect(new Set(runIds).size).toBe(1);
    });
  });

  describe('Summary counts', () => {
    it('counts completed, failed, and not-evaluable correctly', async () => {
      // stripe door succeeds, stripe reference returns Not Evaluable
      // dan-luu door fails
      fetchUrl
        .mockResolvedValueOnce({ html: '<html>OK</html>', metadata: {} }) // stripe door
        .mockRejectedValueOnce({ code: 'FETCH_TIMEOUT', message: 'timeout' }); // dan-luu door

      runApiScan.mockResolvedValue(makeApiResultNotEvaluable());

      const summary = await runBenchmark({ siteIds: ['stripe', 'dan-luu'] });

      expect(summary.completed).toBe(1);  // stripe door
      expect(summary.failed).toBe(1);     // dan-luu door
      expect(summary.notEvaluable).toBe(1); // stripe reference
      expect(summary.bedrockFallbacks).toBe(0); // no Bedrock failures in this test
    });
  });
});
