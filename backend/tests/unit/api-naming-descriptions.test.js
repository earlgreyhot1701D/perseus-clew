/**
 * Perseus Clew: Unit tests for naming-descriptions API check module.
 *
 * Covers: happy path (good spec), bad path (minimal spec), Pitfall #2
 * (shared schema scored once), 80% threshold, zero-instance, determinism.
 */

import { describe, it, expect } from 'vitest';
import { checkNamingDescriptions } from '../../src/checks/api/naming-descriptions.js';

/**
 * Helper: build a minimal parsedSpec structure.
 */
function makeParsedSpec(specOverrides = {}) {
  return {
    spec: {
      openapi: '3.0.3',
      info: { title: 'Test API', description: 'A test API for unit tests.', version: '1.0.0' },
      paths: {},
      components: { schemas: {} },
      tags: [],
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

describe('checkNamingDescriptions', () => {
  describe('zero-instance', () => {
    it('returns full credit when spec has no paths', () => {
      const result = checkNamingDescriptions(makeParsedSpec({ paths: {} }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });

    it('returns full credit when paths is undefined', () => {
      const result = checkNamingDescriptions(makeParsedSpec({ paths: undefined }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('good spec (all sub-checks pass)', () => {
    it('returns 6/6 passed with no findings for well-documented spec', () => {
      const parsedSpec = makeParsedSpec({
        info: {
          title: 'Users API',
          description: 'Manages user accounts, profiles, and authentication tokens.',
          version: '2.0.0'
        },
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users in the system with optional filtering by status and role.'
            }
          },
          '/users/{userId}': {
            get: {
              operationId: 'getUserById',
              description: 'Retrieve a single user by their unique identifier including profile data.'
            }
          }
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                userId: { type: 'string', description: 'Unique identifier for the user' },
                email: { type: 'string', description: 'Primary email address' },
                displayName: { type: 'string', description: 'User-chosen display name' },
                createdAt: { type: 'string', description: 'Timestamp of account creation' }
              }
            }
          }
        },
        tags: [
          { name: 'Users', description: 'Operations related to user management and profiles.' }
        ]
      });

      const result = checkNamingDescriptions(parsedSpec);
      expect(result.total).toBe(6);
      expect(result.passed).toBe(6);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('sub-check 1: operation summary/description presence', () => {
    it('generates finding when operation has neither summary nor description', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/sync': {
            post: { operationId: 'syncData' }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.examples).toContain('POST /sync');
    });

    it('passes when operation has only summary', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with pagination and filtering support.'
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-001');
      expect(finding).toBeUndefined();
    });

    it('passes when operation has only description', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              description: 'Returns a paginated list of all users in the system.'
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-001');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 2: description length', () => {
    it('generates finding for descriptions shorter than 20 chars', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'Gets users'
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-002');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
    });

    it('does not generate finding for descriptions >= 20 chars', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with filters'
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-002');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 3: operationId presence', () => {
    it('generates finding when operationId is missing', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              summary: 'List all users with optional filtering and pagination support.'
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.examples).toContain('GET /users');
    });
  });

  describe('sub-check 4: schema property clarity', () => {
    it('generates finding for unclear property names without descriptions', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/data': {
            get: {
              operationId: 'getData',
              summary: 'Retrieve processed data records from the analytics pipeline.'
            }
          }
        },
        components: {
          schemas: {
            DataRecord: {
              type: 'object',
              properties: {
                auc: { type: 'number' },
                rpc: { type: 'number' },
                xf: { type: 'string' }
              }
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-004');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(3);
      expect(finding.examples[0]).toContain('DataRecord');
    });

    it('passes for self-explaining property names (>=4 chars with vowels)', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with optional filtering and pagination support.'
            }
          }
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                activeUserCount: { type: 'integer' },
                displayName: { type: 'string' }
              }
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-004');
      expect(finding).toBeUndefined();
    });

    it('passes for known abbreviations (id, url, uuid, etc.)', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with optional filtering and pagination support.'
            }
          }
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                url: { type: 'string' },
                uuid: { type: 'string' }
              }
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-004');
      expect(finding).toBeUndefined();
    });

    it('applies 80% threshold: passes when minority of props lack descriptions', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/items': {
            get: {
              operationId: 'listItems',
              summary: 'List all items with optional filtering and pagination support.'
            }
          }
        },
        components: {
          schemas: {
            Item: {
              type: 'object',
              properties: {
                // 4 out of 5 have descriptions (80%)
                name: { type: 'string', description: 'Item name' },
                price: { type: 'number', description: 'Item price in cents' },
                category: { type: 'string', description: 'Category classification' },
                status: { type: 'string', description: 'Current availability status' },
                // 1 unclear prop (20% unclear, which means 80% clear -> passes)
                xq: { type: 'string' }
              }
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-004');
      expect(finding).toBeUndefined();
    });

    it('fails when less than 80% of properties are clear', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/items': {
            get: {
              operationId: 'listItems',
              summary: 'List all items with optional filtering and pagination support.'
            }
          }
        },
        components: {
          schemas: {
            Item: {
              type: 'object',
              properties: {
                // 3 out of 5 have descriptions (60% < 80%)
                name: { type: 'string', description: 'Item name' },
                price: { type: 'number', description: 'Item price in cents' },
                category: { type: 'string', description: 'Category classification' },
                xq: { type: 'string' },
                rp: { type: 'number' }
              }
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-004');
      expect(finding).toBeDefined();
    });

    it('scores each named schema once (Pitfall #2 defense)', () => {
      // Same schema object referenced conceptually from multiple endpoints
      // but only appears once in components.schemas
      const userSchema = {
        type: 'object',
        properties: {
          xq: { type: 'string' },
          rp: { type: 'number' },
          zz: { type: 'string' }
        }
      };

      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with optional filtering and pagination support.'
            }
          },
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              summary: 'Retrieve a single user by their unique identifier in the system.'
            }
          },
          '/teams/{id}/members': {
            get: {
              operationId: 'getTeamMembers',
              summary: 'List members of a team with optional role and status filtering.'
            }
          }
        },
        components: {
          schemas: {
            User: userSchema
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-004');
      expect(finding).toBeDefined();
      // Should be 1 schema finding, not 3 (one per endpoint)
      expect(finding.examples).toHaveLength(1);
      expect(finding.examples[0]).toContain('User');
    });
  });

  describe('sub-check 5: info.description', () => {
    it('generates finding when info.description is missing', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              operationId: 'test',
              summary: 'A test endpoint that returns sample data for validation.'
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-005');
      expect(finding).toBeDefined();
    });

    it('passes when info.description is present', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/test': {
            get: {
              operationId: 'test',
              summary: 'A test endpoint that returns sample data for validation.'
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-005');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 6: tag descriptions', () => {
    it('generates finding when tags lack descriptions', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/test': {
            get: {
              operationId: 'test',
              summary: 'A test endpoint that returns sample data for validation.'
            }
          }
        },
        tags: [
          { name: 'Users' },
          { name: 'Orders' }
        ]
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-006');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.examples).toContain('Users');
      expect(finding.examples).toContain('Orders');
    });

    it('passes when all tags have descriptions', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/test': {
            get: {
              operationId: 'test',
              summary: 'A test endpoint that returns sample data for validation.'
            }
          }
        },
        tags: [
          { name: 'Users', description: 'Operations for managing user accounts and profiles.' }
        ]
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-006');
      expect(finding).toBeUndefined();
    });

    it('passes when no tags exist (nothing to check)', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/test': {
            get: {
              operationId: 'test',
              summary: 'A test endpoint that returns sample data for validation.'
            }
          }
        },
        tags: []
      });

      const result = checkNamingDescriptions(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ND-006');
      expect(finding).toBeUndefined();
    });
  });

  describe('determinism', () => {
    it('produces identical results on repeated runs', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'Short' }
          },
          '/sync': {
            post: {}
          }
        },
        components: {
          schemas: {
            Data: {
              type: 'object',
              properties: { xq: { type: 'string' }, rp: { type: 'number' } }
            }
          }
        },
        tags: [{ name: 'Misc' }]
      });

      const run1 = checkNamingDescriptions(parsedSpec);
      const run2 = checkNamingDescriptions(parsedSpec);

      expect(run1.passed).toBe(run2.passed);
      expect(run1.total).toBe(run2.total);
      expect(run1.findings).toEqual(run2.findings);
    });
  });

  describe('contract shape', () => {
    it('returns { passed, total, findings } matching 1C contract', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/test': {
            get: {
              operationId: 'test',
              summary: 'A test endpoint for contract verification purposes in tests.'
            }
          }
        }
      });

      const result = checkNamingDescriptions(parsedSpec);

      expect(typeof result.passed).toBe('number');
      expect(typeof result.total).toBe('number');
      expect(Array.isArray(result.findings)).toBe(true);
      expect(result.passed).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.passed).toBeLessThanOrEqual(result.total);

      // Each finding has the expected shape
      for (const finding of result.findings) {
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('text');
        expect(finding).toHaveProperty('count');
        expect(typeof finding.id).toBe('string');
        expect(typeof finding.text).toBe('string');
      }
    });
  });
});
