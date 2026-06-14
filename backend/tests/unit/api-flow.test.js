/**
 * Perseus Clew: Unit tests for api-flow.js (Block 1J5).
 *
 * Tests: normal spec -> correct score; empty spec (0 endpoints) -> Not Evaluable
 * with total:null (NOT 100); malformed spec -> clean error; one module throws ->
 * degrades (earns zero), not kills, not inflates; output shape.
 *
 * Mocks parseSpec and all check modules to avoid swagger-parser dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock parse-spec (async)
vi.mock('../../src/shared/parse-spec.js', () => ({
  parseSpec: vi.fn()
}));

// Mock sanitize
vi.mock('../../src/shared/sanitize.js', () => ({
  sanitize: vi.fn((s) => s || '')
}));

// Mock all 6 API check modules
vi.mock('../../src/checks/api/naming-descriptions.js', () => ({
  checkNamingDescriptions: vi.fn(() => ({ passed: 5, total: 6, findings: [] }))
}));
vi.mock('../../src/checks/api/error-design.js', () => ({
  checkErrorDesign: vi.fn(() => ({ passed: 4, total: 5, findings: [] }))
}));
vi.mock('../../src/checks/api/discoverability.js', () => ({
  checkDiscoverability: vi.fn(() => ({ passed: 3, total: 4, findings: [] }))
}));
vi.mock('../../src/checks/api/response-efficiency.js', () => ({
  checkResponseEfficiency: vi.fn(() => ({ passed: 3, total: 4, findings: [] }))
}));
vi.mock('../../src/checks/api/reliability-patterns.js', () => ({
  checkReliabilityPatterns: vi.fn(() => ({ passed: 2, total: 3, findings: [] }))
}));
vi.mock('../../src/checks/api/agent-integration.js', () => ({
  checkAgentIntegration: vi.fn(() => ({ passed: 3, total: 4, findings: [] }))
}));

import { runApiScan } from '../../src/orchestrator/api-flow.js';
import { parseSpec } from '../../src/shared/parse-spec.js';
import { checkNamingDescriptions } from '../../src/checks/api/naming-descriptions.js';

beforeEach(() => {
  vi.clearAllMocks();

  // Default: good spec with operations
  parseSpec.mockResolvedValue({
    spec: {
      openapi: '3.0.3',
      info: { title: 'Test API', version: '1.0.0' },
      paths: { '/users': { get: {} } },
      components: { schemas: {} }
    },
    metadata: {
      originalVersion: '3.0.3',
      title: 'Test API',
      version: '1.0.0',
      endpointCount: 3,
      schemaCount: 2,
      hasServers: true,
      hasSecurity: true
    }
  });

  // Reset check modules to defaults
  checkNamingDescriptions.mockReturnValue({ passed: 5, total: 6, findings: [] });
});

describe('runApiScan', () => {
  describe('normal spec -> correct score', () => {
    it('returns a scored result with the correct shape', async () => {
      const result = await runApiScan('{"openapi":"3.0.3"}');

      expect(result.error).toBe(false);
      expect(result.meta.scanType).toBe('spec');
      expect(result.meta.specTitle).toBe('Test API');
      expect(result.meta.methodologyVersion).toBe('1.1.1');
      expect(result.scoredViews.api.score).toHaveProperty('total');
      expect(result.scoredViews.api.score).toHaveProperty('rating');
      expect(result.scoredViews.api.score).toHaveProperty('breakdown');
      expect(result.scoredViews.api).toHaveProperty('findings');
    });

    it('produces a valid score between 0 and 100', async () => {
      const result = await runApiScan('{}');

      expect(result.scoredViews.api.score.total).toBeGreaterThanOrEqual(0);
      expect(result.scoredViews.api.score.total).toBeLessThanOrEqual(100);
    });

    it('produces a valid rating band', async () => {
      const result = await runApiScan('{}');

      expect(['Agent-Ready', 'Partially Ready', 'Not Yet Readable']).toContain(
        result.scoredViews.api.score.rating
      );
    });
  });

  describe('empty spec (L-APIFLOW-1): Not Evaluable, NOT 100', () => {
    it('returns Not Evaluable with total:null when endpointCount is 0', async () => {
      parseSpec.mockResolvedValue({
        spec: { openapi: '3.0.3', info: { title: 'Empty', version: '1.0.0' }, paths: {} },
        metadata: {
          originalVersion: '3.0.3',
          title: 'Empty',
          version: '1.0.0',
          endpointCount: 0,
          schemaCount: 0,
          hasServers: false,
          hasSecurity: false
        }
      });

      const result = await runApiScan('{}');

      expect(result.error).toBe(false);
      expect(result.scoredViews.api.score.total).toBeNull();
      expect(result.scoredViews.api.score.rating).toBe('Not Evaluable');
    });

    it('does NOT score 100 on an empty spec', async () => {
      parseSpec.mockResolvedValue({
        spec: { openapi: '3.0.3', info: { title: 'Empty', version: '1.0.0' }, paths: {} },
        metadata: { originalVersion: '3.0.3', title: 'Empty', version: '1.0.0', endpointCount: 0, schemaCount: 0, hasServers: false, hasSecurity: false }
      });

      const result = await runApiScan('{}');

      expect(result.scoredViews.api.score.total).not.toBe(100);
      expect(result.scoredViews.api.score.rating).not.toBe('Agent-Ready');
    });

    it('does not call check modules when spec is empty', async () => {
      parseSpec.mockResolvedValue({
        spec: { openapi: '3.0.3', info: { title: 'Empty', version: '1.0.0' }, paths: {} },
        metadata: { originalVersion: '3.0.3', title: 'Empty', version: '1.0.0', endpointCount: 0, schemaCount: 0, hasServers: false, hasSecurity: false }
      });

      await runApiScan('{}');

      expect(checkNamingDescriptions).not.toHaveBeenCalled();
    });
  });

  describe('malformed/unparseable spec -> clean error', () => {
    it('returns error shape when parseSpec throws', async () => {
      const err = new Error('Not valid JSON');
      err.code = 'PARSE_INVALID_SPEC';
      err.userMessage = 'This file could not be parsed as JSON or YAML.';
      parseSpec.mockRejectedValue(err);

      const result = await runApiScan('not valid json at all');

      expect(result.error).toBe(true);
      expect(result.code).toBe('PARSE_INVALID_SPEC');
      expect(result.message).toContain('could not be parsed');
    });

    it('does not crash on unexpected parseSpec error', async () => {
      parseSpec.mockRejectedValue(new Error('unexpected'));

      const result = await runApiScan('garbage');

      expect(result.error).toBe(true);
      expect(result.message).toBeTruthy();
    });
  });

  describe('per-module isolation (1J mirror)', () => {
    it('scan continues when one check module throws', async () => {
      checkNamingDescriptions.mockImplementation(() => {
        throw new Error('Module crash');
      });

      const result = await runApiScan('{}');

      expect(result.error).toBe(false);
      expect(result.scoredViews.api.score).toHaveProperty('total');
      expect(result.scoredViews.api.score).toHaveProperty('rating');
    });

    it('crashed module earns ZERO for its category (not full credit)', async () => {
      checkNamingDescriptions.mockImplementation(() => {
        throw new Error('crash');
      });

      const result = await runApiScan('{}');

      // naming_descriptions has weight 25. Crashed -> {passed:0, total:1}
      // -> Math.round(0/1 * 25) = 0
      const earned = result.scoredViews.api.score.breakdown.naming_descriptions.earned;
      expect(earned).toBe(0);
    });

    it('crashed module does NOT inflate score via total:0 path', async () => {
      checkNamingDescriptions.mockImplementation(() => {
        throw new Error('crash');
      });

      const result = await runApiScan('{}');

      // Full credit would be 25. Must be 0.
      const earned = result.scoredViews.api.score.breakdown.naming_descriptions.earned;
      expect(earned).not.toBe(25);
    });

    it('other modules still score normally when one crashes', async () => {
      checkNamingDescriptions.mockImplementation(() => {
        throw new Error('crash');
      });

      const result = await runApiScan('{}');

      // error_design: passed:4, total:5, weight:20 -> Math.round(4/5*20) = 16
      const errorDesignEarned = result.scoredViews.api.score.breakdown.error_design.earned;
      expect(errorDesignEarned).toBe(16);
    });
  });

  describe('output shape', () => {
    it('normal result has error:false, meta, scoredViews.api', async () => {
      const result = await runApiScan('{}');

      expect(result.error).toBe(false);
      expect(result.meta).toHaveProperty('scanType', 'spec');
      expect(result.meta).toHaveProperty('methodologyVersion');
      expect(result.meta).toHaveProperty('endpointCount');
      expect(result.scoredViews).toHaveProperty('api');
      expect(result.scoredViews.api).toHaveProperty('score');
      expect(result.scoredViews.api).toHaveProperty('findings');
    });

    it('Not Evaluable result has score.total:null and empty breakdown', async () => {
      parseSpec.mockResolvedValue({
        spec: { openapi: '3.0.3', info: { title: 'E', version: '1' }, paths: {} },
        metadata: { originalVersion: '3.0.3', title: 'E', version: '1', endpointCount: 0, schemaCount: 0, hasServers: false, hasSecurity: false }
      });

      const result = await runApiScan('{}');

      expect(result.scoredViews.api.score.total).toBeNull();
      expect(result.scoredViews.api.score.breakdown).toEqual({});
      expect(result.scoredViews.api.findings).toEqual({});
    });

    it('error result has error:true, code, message', async () => {
      parseSpec.mockRejectedValue(Object.assign(new Error('bad'), { code: 'PARSE_INVALID_SPEC', userMessage: 'msg' }));

      const result = await runApiScan('bad');

      expect(result.error).toBe(true);
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('message');
      expect(result).not.toHaveProperty('scoredViews');
    });
  });
});
