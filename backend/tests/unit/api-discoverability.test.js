/**
 * Perseus Clew: Unit tests for discoverability API check module.
 *
 * Covers: happy path, bad path, Pitfall #2 (one finding per resource not per op),
 * action-endpoint exclusion, singleton exclusion, per-sub-check applicability,
 * zero-instance, full-sentence grammar at count=1 and count>=2, Swagger 2.0, determinism.
 */

import { describe, it, expect } from 'vitest';
import { checkDiscoverability } from '../../src/checks/api/discoverability.js';

function makeParsedSpec(specOverrides = {}) {
  return {
    spec: {
      openapi: '3.0.3',
      info: { title: 'Test API', description: 'A test API for unit tests.', version: '1.0.0' },
      paths: {},
      components: { schemas: {} },
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

describe('checkDiscoverability', () => {
  describe('zero-instance', () => {
    it('returns full credit when spec has no paths', () => {
      const result = checkDiscoverability(makeParsedSpec({ paths: {} }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });

    it('returns full credit when paths is undefined', () => {
      const result = checkDiscoverability(makeParsedSpec({ paths: undefined }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('good spec (all sub-checks pass)', () => {
    it('passes when list endpoints exist for all item resources', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with pagination and filtering.',
              parameters: [
                { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
                { name: 'limit', in: 'query', schema: { type: 'integer' } }
              ]
            }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      expect(result.findings).toHaveLength(0);
      expect(result.passed).toBe(result.total);
    });
  });

  describe('sub-check 1: list endpoint presence (API-DISC-001)', () => {
    it('generates finding when item path has no sibling list endpoint', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.examples[0]).toContain('/users');
    });

    it('passes when list endpoint exists', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List all users in the system.' }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      expect(finding).toBeUndefined();
    });
  });

  describe('Pitfall #2: dedup by resource, not per operation', () => {
    it('counts one finding per resource even when multiple methods exist', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/orders/{orderId}': {
            get: { operationId: 'getOrder', summary: 'Get an order by ID.' },
            put: { operationId: 'updateOrder', summary: 'Update an existing order.' },
            delete: { operationId: 'deleteOrder', summary: 'Remove an order from the system.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      expect(finding).toBeDefined();
      // ONE finding for /orders resource, NOT three (one per method)
      expect(finding.count).toBe(1);
      expect(finding.examples).toHaveLength(1);
      expect(finding.examples[0]).toContain('/orders');
    });
  });

  describe('action endpoint exclusion', () => {
    it('does NOT flag action paths like /orders/{id}/cancel', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/orders': {
            get: { operationId: 'listOrders', summary: 'List all orders.' }
          },
          '/orders/{orderId}': {
            get: { operationId: 'getOrder', summary: 'Get an order by ID.' }
          },
          '/orders/{orderId}/cancel': {
            post: { operationId: 'cancelOrder', summary: 'Cancel an existing order.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      // /orders has a list, /orders/{id}/cancel is an action (excluded)
      expect(finding).toBeUndefined();
    });

    it('does NOT flag action paths detected via operationId', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/emails/{emailId}': {
            post: { operationId: 'sendEmail', summary: 'Send a specific email message.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      // All operations are action-oriented, so excluded
      expect(finding).toBeUndefined();
    });

    it('does NOT flag /jobs/{id}/retry as needing a list', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/jobs': {
            get: { operationId: 'listJobs', summary: 'List all scheduled jobs.' }
          },
          '/jobs/{jobId}': {
            get: { operationId: 'getJob', summary: 'Get a job by its identifier.' }
          },
          '/jobs/{jobId}/retry': {
            post: { operationId: 'retryJob', summary: 'Retry a failed job execution.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      expect(finding).toBeUndefined();
    });
  });

  describe('singleton exclusion', () => {
    it('does NOT flag singleton paths like /me/{field}', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/me/{field}': {
            get: { operationId: 'getMyField', summary: 'Get a field from current user profile.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      expect(finding).toBeUndefined();
    });

    it('does NOT flag /account/{section}', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/account/{section}': {
            get: { operationId: 'getAccountSection', summary: 'Get account settings section.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 2: nested resource listability (API-DISC-002)', () => {
    it('generates finding when nested parent is not independently listable', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/courses/{courseId}/students/{studentId}': {
            get: { operationId: 'getStudent', summary: 'Get a student in a course.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-002');
      expect(finding).toBeDefined();
    });

    it('passes when parent collections are independently listable', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/courses': {
            get: { operationId: 'listCourses', summary: 'List all available courses.' }
          },
          '/courses/{courseId}': {
            get: { operationId: 'getCourse', summary: 'Get a course by ID.' }
          },
          '/courses/{courseId}/students': {
            get: { operationId: 'listStudents', summary: 'List students in a course.' }
          },
          '/courses/{courseId}/students/{studentId}': {
            get: { operationId: 'getStudent', summary: 'Get a student in a course.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-002');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 3: filter documentation (API-DISC-003)', () => {
    it('generates finding when list endpoint has no query params', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List all users in the system.' }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
    });

    it('passes when list endpoint documents query params', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with filtering support.',
              parameters: [
                { name: 'status', in: 'query', schema: { type: 'string' } }
              ]
            }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-003');
      expect(finding).toBeUndefined();
    });

    it('handles path-level parameters (Swagger 2.0 pattern)', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            parameters: [
              { name: 'role', in: 'query', schema: { type: 'string' } }
            ],
            get: { operationId: 'listUsers', summary: 'List all users in the system.' }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-003');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 4: enum values on filters (API-DISC-004)', () => {
    it('generates finding when string filter param has no enum', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with filtering support.',
              parameters: [
                { name: 'status', in: 'query', schema: { type: 'string' } }
              ]
            }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-004');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.examples[0]).toContain('?status');
    });

    it('passes when filter param has enum values', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with filtering support.',
              parameters: [
                { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } }
              ]
            }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-004');
      expect(finding).toBeUndefined();
    });

    it('does not flag pagination params (limit, offset, etc.)', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with pagination support.',
              parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer' } },
                { name: 'offset', in: 'query', schema: { type: 'integer' } }
              ]
            }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-004');
      // Pagination params are integer-typed AND in the exclusion set, so no finding
      expect(finding).toBeUndefined();
    });
  });

  describe('per-sub-check applicability gating', () => {
    it('sub-check 1 is N/A when no parameterized paths exist', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List all users in the system.' }
          },
          '/health': {
            get: { operationId: 'healthCheck', summary: 'Check service health status.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      // No /{id} paths -> sub-check 1 N/A. List endpoints exist -> sub-check 3 applies.
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      expect(finding).toBeUndefined();
    });

    it('sub-checks 3/4 are N/A when no list endpoints exist', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      // Only sub-check 1 applies (missing list), no list endpoints -> 3/4 N/A
      // total should be 1 (just sub-check 1)
      expect(result.total).toBe(1);
    });

    it('sub-check 2 is N/A when no nested (depth>=2) resources exist', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      // depth=1 only, sub-check 2 N/A
      const finding = result.findings.find(f => f.id === 'API-DISC-002');
      expect(finding).toBeUndefined();
    });
  });

  describe('determinism', () => {
    it('produces identical results on repeated runs', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with filtering support.',
              parameters: [
                { name: 'status', in: 'query', schema: { type: 'string' } }
              ]
            }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          },
          '/orders/{orderId}': {
            get: { operationId: 'getOrder', summary: 'Get an order by ID.' }
          }
        }
      });

      const run1 = checkDiscoverability(parsedSpec);
      const run2 = checkDiscoverability(parsedSpec);

      expect(run1.passed).toBe(run2.passed);
      expect(run1.total).toBe(run2.total);
      expect(run1.findings).toEqual(run2.findings);
    });
  });

  describe('contract shape', () => {
    it('returns { passed, total, findings } matching 1C contract', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List all users in the system.' }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);

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

  describe('L-2: full-sentence grammar agreement at count=1 and count>=2', () => {
    it('API-DISC-001 at count=1: singular primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 resource has');
      expect(finding.text).toContain('this resource');
      expect(finding.text).not.toContain('resources have');
      expect(finding.text).not.toContain('these resources');
    });

    it('API-DISC-001 at count>=2: plural primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          },
          '/orders/{orderId}': {
            get: { operationId: 'getOrder', summary: 'Get an order by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.text).toContain('2 resources have');
      expect(finding.text).toContain('these resources');
      expect(finding.text).not.toContain('1 resource has');
      expect(finding.text).not.toContain('this resource');
    });

    it('API-DISC-003 at count=1: singular primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List all users in the system.' }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 list endpoint documents');
      expect(finding.text).toContain('this endpoint');
      expect(finding.text).not.toContain('list endpoints document');
      expect(finding.text).not.toContain('these endpoints');
    });

    it('API-DISC-003 at count>=2: plural primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List all users in the system.' }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          },
          '/orders': {
            get: { operationId: 'listOrders', summary: 'List all orders in the system.' }
          },
          '/orders/{orderId}': {
            get: { operationId: 'getOrder', summary: 'Get an order by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.text).toContain('2 list endpoints document');
      expect(finding.text).toContain('these endpoints');
      expect(finding.text).not.toContain('1 list endpoint documents');
      expect(finding.text).not.toContain('this endpoint');
    });

    it('API-DISC-004 at count=1: singular primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with filtering support.',
              parameters: [
                { name: 'role', in: 'query', schema: { type: 'string' } }
              ]
            }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-004');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 filter parameter has');
      expect(finding.text).toContain('this parameter');
      expect(finding.text).not.toContain('filter parameters have');
      expect(finding.text).not.toContain('these parameters');
    });

    it('API-DISC-004 at count>=2: plural primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with filtering support.',
              parameters: [
                { name: 'role', in: 'query', schema: { type: 'string' } },
                { name: 'status', in: 'query', schema: { type: 'string' } }
              ]
            }
          },
          '/users/{userId}': {
            get: { operationId: 'getUser', summary: 'Get a single user by ID.' }
          }
        }
      });

      const result = checkDiscoverability(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-DISC-004');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.text).toContain('2 filter parameters have');
      expect(finding.text).toContain('these parameters');
      expect(finding.text).not.toContain('1 filter parameter has');
      expect(finding.text).not.toContain('this parameter');
    });
  });
});
