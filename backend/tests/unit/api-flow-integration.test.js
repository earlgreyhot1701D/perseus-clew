/**
 * Perseus Clew: Integration test for api-flow.js + real parseSpec.
 *
 * Uses the REAL parseSpec (not mocked) to verify that the L-APIFLOW-1
 * short-circuit is bound to the actual endpointCount contract. If
 * parse-spec ever renames endpointCount, this test FAILS — preventing
 * a silent regression where empty specs score 100.
 *
 * Requires @apidevtools/swagger-parser (skips gracefully if unavailable).
 */

import { describe, it, expect } from 'vitest';

// Attempt to import the real flow — will fail if swagger-parser not installed
let runApiScan;
let available = true;
try {
  const mod = await import('../../src/orchestrator/api-flow.js');
  runApiScan = mod.runApiScan;
} catch {
  available = false;
}

const EMPTY_SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Empty API', version: '1.0.0' },
  paths: {}
});

const NORMAL_SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Users API', description: 'Manages user accounts and profiles.', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List all users with optional filtering and pagination support.',
        responses: { '200': { description: 'OK' } }
      }
    },
    '/users/{userId}': {
      get: {
        operationId: 'getUser',
        summary: 'Retrieve a single user by their unique identifier in the system.',
        responses: {
          '200': { description: 'OK' },
          '404': { description: 'Not found' }
        }
      }
    }
  },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } }
  },
  externalDocs: { url: 'https://docs.example.com' }
});

describe.skipIf(!available)('api-flow.js integration (real parseSpec)', () => {
  it('empty spec (paths:{}) -> Not Evaluable, total:null', async () => {
    const result = await runApiScan(EMPTY_SPEC);

    expect(result.error).toBe(false);
    expect(result.scoredViews.api.score.total).toBeNull();
    expect(result.scoredViews.api.score.rating).toBe('Not Evaluable');
  });

  it('empty spec does NOT score 100 (the L-APIFLOW-1 guard)', async () => {
    const result = await runApiScan(EMPTY_SPEC);

    expect(result.scoredViews.api.score.total).not.toBe(100);
    expect(result.scoredViews.api.score.rating).not.toBe('Agent-Ready');
  });

  it('normal spec with operations -> numeric score and valid rating', async () => {
    const result = await runApiScan(NORMAL_SPEC);

    expect(result.error).toBe(false);
    expect(typeof result.scoredViews.api.score.total).toBe('number');
    expect(result.scoredViews.api.score.total).toBeGreaterThanOrEqual(0);
    expect(result.scoredViews.api.score.total).toBeLessThanOrEqual(100);
    expect(['Agent-Ready', 'Partially Ready', 'Not Yet Readable']).toContain(
      result.scoredViews.api.score.rating
    );
  });

  it('malformed spec -> error result, not crash', async () => {
    const result = await runApiScan('this is not json or yaml');

    expect(result.error).toBe(true);
    expect(result.code).toBeTruthy();
    expect(result.message).toBeTruthy();
  });
});
