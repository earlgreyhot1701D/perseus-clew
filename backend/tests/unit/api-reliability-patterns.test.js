/**
 * Perseus Clew: Unit tests for reliability-patterns API check module.
 *
 * Covers: happy path, idempotency informational (does not touch total),
 * deprecation N/A (no deprecated ops), successor finding, policy finding,
 * versioning finding, zero-instance, full-sentence grammar (REL-001 count-aware,
 * REL-002/REL-003 fixed-singular), Swagger 2.0, determinism.
 */

import { describe, it, expect } from 'vitest';
import { checkReliabilityPatterns } from '../../src/checks/api/reliability-patterns.js';

function makeParsedSpec(specOverrides = {}) {
  return {
    spec: {
      openapi: '3.0.3',
      info: { title: 'Test API', description: 'A test API for unit tests.', version: '1.0.0' },
      paths: {},
      components: { schemas: {} },
      servers: [],
      ...specOverrides
    },
    metadata: {
      originalVersion: '3.0.3',
      title: 'Test API',
      version: '1.0.0',
      endpointCount: 0,
      schemaCount: 0,
      hasServers: false,
      hasSecurity: false
    }
  };
}

describe('checkReliabilityPatterns', () => {
  describe('zero-instance', () => {
    it('returns full credit when spec has no paths', () => {
      const result = checkReliabilityPatterns(makeParsedSpec({ paths: {} }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });

    it('returns full credit when paths is undefined', () => {
      const result = checkReliabilityPatterns(makeParsedSpec({ paths: undefined }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('good spec (all sub-checks pass)', () => {
    it('passes when deprecated ops have successors, policy exists, and versioning is clear', () => {
      const parsedSpec = makeParsedSpec({
        info: {
          title: 'Users API',
          description: 'Manages user accounts. Deprecation policy: deprecated endpoints are removed after 6 months with migration guides.',
          version: '2.1.0'
        },
        paths: {
          '/v2/users': {
            get: { operationId: 'listUsers', summary: 'List all users with pagination.' }
          },
          '/v1/users': {
            get: {
              operationId: 'listUsersV1',
              summary: 'List users (legacy).',
              deprecated: true,
              description: 'Use GET /v2/users instead. This endpoint will be removed in Q3 2026.'
            }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      expect(result.findings).toHaveLength(0);
      expect(result.passed).toBe(result.total);
    });
  });

  describe('informational sub-check 1: POST idempotency does NOT touch total', () => {
    it('does not increment total regardless of idempotency support', () => {
      // Spec with a POST that has no idempotency support
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'Test API.', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: { '201': { description: 'Created' } }
            }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      // Only versioning (SC4) is applicable (no deprecated ops -> SC2/SC3 N/A)
      // Idempotency NEVER touches total
      expect(result.total).toBe(1);
    });

    it('does not generate a finding for absence of Idempotency-Key', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'Test API.', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account.',
              responses: { '201': { description: 'Created' } }
            }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      // No finding about idempotency
      const idempotencyFinding = result.findings.find(f =>
        f.text.toLowerCase().includes('idempoten')
      );
      expect(idempotencyFinding).toBeUndefined();
    });
  });

  describe('sub-check applicability: deprecation N/A when no deprecated ops', () => {
    it('only versioning (SC4) counts when no operations are deprecated', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'A fresh API with no deprecated endpoints.', version: '2.0.0' },
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List all users.' }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      // No deprecated ops -> SC2 (successor) and SC3 (policy) are N/A
      // Only SC4 (versioning) applies. version is semver -> passes.
      expect(result.total).toBe(1);
      expect(result.passed).toBe(1);
      expect(result.findings).toHaveLength(0);
    });

    it('SC2 and SC3 become applicable when deprecated ops exist', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'An API.', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users.',
              deprecated: true
            }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      // SC2 (successor) + SC3 (policy) + SC4 (versioning) = total 3
      expect(result.total).toBe(3);
    });
  });

  describe('API-REL-001: deprecated successors', () => {
    it('generates finding when deprecated op lacks successor reference', () => {
      const parsedSpec = makeParsedSpec({
        info: {
          title: 'API',
          description: 'An API with deprecation policy documented here for testing.',
          version: '1.0.0'
        },
        paths: {
          '/old-endpoint': {
            get: {
              operationId: 'oldEndpoint',
              summary: 'An old endpoint.',
              deprecated: true,
              description: 'This endpoint is deprecated.'
            }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-REL-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.examples).toContain('GET /old-endpoint');
    });

    it('passes when deprecated op references successor via description', () => {
      const parsedSpec = makeParsedSpec({
        info: {
          title: 'API',
          description: 'API with deprecation policy for scheduled removals.',
          version: '1.0.0'
        },
        paths: {
          '/old-endpoint': {
            get: {
              operationId: 'oldEndpoint',
              summary: 'An old endpoint.',
              deprecated: true,
              description: 'Use GET /new-endpoint instead. This will be removed in v3.'
            }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-REL-001');
      expect(finding).toBeUndefined();
    });

    it('passes when deprecated op references successor via externalDocs', () => {
      const parsedSpec = makeParsedSpec({
        info: {
          title: 'API',
          description: 'API with deprecation policy documented.',
          version: '1.0.0'
        },
        paths: {
          '/old-endpoint': {
            get: {
              operationId: 'oldEndpoint',
              summary: 'An old endpoint.',
              deprecated: true,
              externalDocs: {
                description: 'Migration guide to the replacement endpoint',
                url: 'https://docs.example.com/migrate'
              }
            }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-REL-001');
      expect(finding).toBeUndefined();
    });
  });

  describe('API-REL-002: deprecation policy', () => {
    it('generates finding when info.description lacks policy keywords', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'A simple user management API.', version: '1.0.0' },
        paths: {
          '/old': {
            get: {
              operationId: 'old',
              summary: 'Old endpoint.',
              deprecated: true,
              description: 'Use /new instead.'
            }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-REL-002');
      expect(finding).toBeDefined();
      expect(finding.count).toBeNull();
    });

    it('passes when info.description mentions deprecation policy', () => {
      const parsedSpec = makeParsedSpec({
        info: {
          title: 'API',
          description: 'User API. Deprecation policy: endpoints are sunset 6 months after marking.',
          version: '1.0.0'
        },
        paths: {
          '/old': {
            get: {
              operationId: 'old',
              summary: 'Old endpoint.',
              deprecated: true,
              description: 'Use /new instead.'
            }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-REL-002');
      expect(finding).toBeUndefined();
    });
  });

  describe('API-REL-003: versioning clarity', () => {
    it('generates finding when no versioning signal exists', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'An API.', version: 'latest' },
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List users.' }
          }
        },
        servers: [{ url: 'https://api.example.com' }]
      });

      const result = checkReliabilityPatterns(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-REL-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBeNull();
    });

    it('passes when info.version is semver', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'An API.', version: '2.1.0' },
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List users.' }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-REL-003');
      expect(finding).toBeUndefined();
    });

    it('passes when servers URL contains version segment', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'An API.', version: 'current' },
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List users.' }
          }
        },
        servers: [{ url: 'https://api.example.com/v2' }]
      });

      const result = checkReliabilityPatterns(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-REL-003');
      expect(finding).toBeUndefined();
    });

    it('passes when paths contain version prefix', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'An API.', version: 'current' },
        paths: {
          '/v2/users': {
            get: { operationId: 'listUsers', summary: 'List users.' }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-REL-003');
      expect(finding).toBeUndefined();
    });

    it('handles Swagger 2.0 converted servers (host+basePath)', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'An API.', version: 'current' },
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List users.' }
          }
        },
        servers: [{ url: 'https://api.example.com/v1' }]
      });

      const result = checkReliabilityPatterns(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-REL-003');
      expect(finding).toBeUndefined();
    });
  });

  describe('determinism', () => {
    it('produces identical results on repeated runs', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'An API.', version: 'latest' },
        paths: {
          '/old': {
            get: {
              operationId: 'old',
              summary: 'Old endpoint.',
              deprecated: true,
              description: 'This is deprecated.'
            }
          },
          '/users': {
            get: { operationId: 'listUsers', summary: 'List users.' }
          }
        },
        servers: [{ url: 'https://api.example.com' }]
      });

      const run1 = checkReliabilityPatterns(parsedSpec);
      const run2 = checkReliabilityPatterns(parsedSpec);

      expect(run1.passed).toBe(run2.passed);
      expect(run1.total).toBe(run2.total);
      expect(run1.findings).toEqual(run2.findings);
    });
  });

  describe('contract shape', () => {
    it('returns { passed, total, findings } matching 1C contract', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', description: 'An API.', version: '1.0.0' },
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List users.' }
          }
        }
      });

      const result = checkReliabilityPatterns(parsedSpec);

      expect(typeof result.passed).toBe('number');
      expect(typeof result.total).toBe('number');
      expect(Array.isArray(result.findings)).toBe(true);
      expect(result.passed).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.passed).toBeLessThanOrEqual(result.total);

      for (const finding of result.findings) {
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('text');
        expect(finding).toHaveProperty('count');
        expect(typeof finding.id).toBe('string');
        expect(typeof finding.text).toBe('string');
      }
    });
  });

  describe('L-2: full-sentence grammar', () => {
    describe('API-REL-001 (count-aware: one or many deprecated ops without successor)', () => {
      it('at count=1: singular primary and secondary clause', () => {
        const parsedSpec = makeParsedSpec({
          info: {
            title: 'API',
            description: 'API with deprecation policy for endpoint removal.',
            version: '1.0.0'
          },
          paths: {
            '/old': {
              get: {
                operationId: 'old',
                summary: 'Old endpoint.',
                deprecated: true,
                description: 'This is deprecated.'
              }
            }
          }
        });

        const result = checkReliabilityPatterns(parsedSpec);
        const finding = result.findings.find(f => f.id === 'API-REL-001');
        expect(finding).toBeDefined();
        expect(finding.count).toBe(1);
        expect(finding.text).toContain('1 deprecated operation does');
        expect(finding.text).toContain('this endpoint');
        expect(finding.text).not.toContain('deprecated operations do');
        expect(finding.text).not.toContain('these endpoints');
      });

      it('at count>=2: plural primary and secondary clause', () => {
        const parsedSpec = makeParsedSpec({
          info: {
            title: 'API',
            description: 'API with deprecation policy for endpoint removal.',
            version: '1.0.0'
          },
          paths: {
            '/old-a': {
              get: {
                operationId: 'oldA',
                summary: 'Old endpoint A.',
                deprecated: true,
                description: 'This is deprecated.'
              }
            },
            '/old-b': {
              post: {
                operationId: 'oldB',
                summary: 'Old endpoint B.',
                deprecated: true,
                description: 'Also deprecated.'
              }
            }
          }
        });

        const result = checkReliabilityPatterns(parsedSpec);
        const finding = result.findings.find(f => f.id === 'API-REL-001');
        expect(finding).toBeDefined();
        expect(finding.count).toBe(2);
        expect(finding.text).toContain('2 deprecated operations do');
        expect(finding.text).toContain('these endpoints');
        expect(finding.text).not.toContain('1 deprecated operation does');
        expect(finding.text).not.toContain('this endpoint');
      });
    });

    describe('API-REL-002 (fixed-singular: spec-global deprecation policy)', () => {
      it('produces a fixed singular string with no count template', () => {
        const parsedSpec = makeParsedSpec({
          info: { title: 'API', description: 'A simple user management API.', version: '1.0.0' },
          paths: {
            '/old': {
              get: {
                operationId: 'old',
                summary: 'Old endpoint.',
                deprecated: true,
                description: 'Use /new instead.'
              }
            }
          }
        });

        const result = checkReliabilityPatterns(parsedSpec);
        const finding = result.findings.find(f => f.id === 'API-REL-002');
        expect(finding).toBeDefined();
        expect(finding.count).toBeNull();
        // Fixed singular string, no count-dependent template
        expect(finding.text).toBe(
          'The spec does not document a deprecation policy. An agent encountering deprecated endpoints cannot determine the timeline or process for migration.'
        );
        // No plural-hardcode risk: count is null, string is fixed
      });
    });

    describe('API-REL-003 (fixed-singular: spec-global versioning verdict)', () => {
      it('produces a fixed singular string with no count template', () => {
        const parsedSpec = makeParsedSpec({
          info: { title: 'API', description: 'An API.', version: 'latest' },
          paths: {
            '/users': {
              get: { operationId: 'listUsers', summary: 'List users.' }
            }
          },
          servers: [{ url: 'https://api.example.com' }]
        });

        const result = checkReliabilityPatterns(parsedSpec);
        const finding = result.findings.find(f => f.id === 'API-REL-003');
        expect(finding).toBeDefined();
        expect(finding.count).toBeNull();
        // Fixed singular string, no count-dependent template
        expect(finding.text).toBe(
          'The spec does not communicate a versioning strategy. An agent consuming this API cannot determine which version it is using or how to detect version changes.'
        );
      });
    });
  });
});
