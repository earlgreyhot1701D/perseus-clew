/**
 * Perseus Clew: Unit tests for response-efficiency API check module.
 *
 * Covers: happy path, bad path (deeply nested, no pagination/total/filter),
 * allOf-depth (composition measured correctly via walk-schema), cycle-safety
 * (circular schema terminates with bounded depth), Pitfall #2 (shared response
 * schema scored once), list-detection (single-object GET NOT flagged),
 * per-sub-check applicability, zero-instance, full-sentence grammar at count=1
 * and count>=2, Swagger 2.0, determinism.
 */

import { describe, it, expect } from 'vitest';
import { checkResponseEfficiency } from '../../src/checks/api/response-efficiency.js';

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

/** Flat response schema (depth 1) */
const FLAT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' }
  }
};

/** Deeply nested schema (depth 4) */
const DEEP_SCHEMA = {
  type: 'object',
  properties: {
    data: {
      type: 'object',
      properties: {
        items: {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              properties: {
                value: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

/** List response schema (direct array) */
const ARRAY_SCHEMA = { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } };

/** Wrapped list response schema (object with data array) */
const WRAPPED_LIST_SCHEMA = {
  type: 'object',
  properties: {
    data: { type: 'array', items: { type: 'object' } },
    totalCount: { type: 'integer' }
  }
};

describe('checkResponseEfficiency', () => {
  describe('zero-instance', () => {
    it('returns full credit when spec has no paths', () => {
      const result = checkResponseEfficiency(makeParsedSpec({ paths: {} }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });

    it('returns full credit when no response schemas and no list endpoints exist', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/health': {
            get: {
              operationId: 'healthCheck',
              summary: 'Returns service health status.',
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('good spec (all sub-checks pass)', () => {
    it('passes for flat schemas with paginated, filtered list endpoints', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with filtering and pagination.',
              parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer' } },
                { name: 'status', in: 'query', schema: { type: 'string' } }
              ],
              responses: {
                '200': {
                  description: 'Success',
                  content: { 'application/json': { schema: WRAPPED_LIST_SCHEMA } }
                }
              }
            }
          },
          '/users/{userId}': {
            get: {
              operationId: 'getUser',
              summary: 'Get a single user by ID.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: FLAT_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      expect(result.findings).toHaveLength(0);
      expect(result.passed).toBe(result.total);
    });
  });

  describe('sub-check 1: nesting depth (API-RE-001)', () => {
    it('generates finding for deeply nested response schema', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/data': {
            get: {
              operationId: 'getData',
              summary: 'Retrieve processed data from the pipeline.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: DEEP_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
    });

    it('passes for flat response schema (depth < 3)', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              summary: 'Get a single user by ID.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: FLAT_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-001');
      expect(finding).toBeUndefined();
    });

    it('measures depth through allOf composition correctly', () => {
      // allOf members don't add depth; their contents do
      const composedSchema = {
        allOf: [
          {
            type: 'object',
            properties: {
              level1: {
                type: 'object',
                properties: {
                  level2: {
                    type: 'object',
                    properties: {
                      level3: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        ]
      };

      const parsedSpec = makeParsedSpec({
        paths: {
          '/composed': {
            get: {
              operationId: 'getComposed',
              summary: 'Get a composed response object.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: composedSchema } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-001');
      // allOf at same depth, then properties go 1->2->3 = depth 3, threshold hit
      expect(finding).toBeDefined();
    });
  });

  describe('cycle-safety', () => {
    it('does not hang on circular response schemas', () => {
      const treeNode = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          children: { type: 'array', items: null }
        }
      };
      // Create circular ref: children.items -> treeNode
      treeNode.properties.children.items = treeNode;

      const parsedSpec = makeParsedSpec({
        paths: {
          '/tree': {
            get: {
              operationId: 'getTree',
              summary: 'Get the tree structure.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: treeNode } } }
              }
            }
          }
        }
      });

      // Must terminate, not hang or stack-overflow
      const result = checkResponseEfficiency(parsedSpec);
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('findings');
    });

    it('reports bounded depth for circular schemas (not infinite)', () => {
      const recursive = {
        type: 'object',
        properties: {
          value: { type: 'string' },
          child: null
        }
      };
      recursive.properties.child = recursive;

      const parsedSpec = makeParsedSpec({
        paths: {
          '/node': {
            get: {
              operationId: 'getNode',
              summary: 'Get a recursive node.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: recursive } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      // Should not report infinite depth; WeakSet stops at cycle
      // The depth is bounded (root has properties at depth 1, but child is cycle -> stops)
      // So it should NOT trigger the threshold of 3
      const finding = result.findings.find(f => f.id === 'API-RE-001');
      expect(finding).toBeUndefined();
    });
  });

  describe('Pitfall #2: shared response schema scored once', () => {
    it('counts shared schema once even when used by multiple endpoints', () => {
      const sharedDeep = {
        type: 'object',
        properties: {
          wrapper: {
            type: 'object',
            properties: {
              inner: {
                type: 'object',
                properties: {
                  deep: { type: 'object', properties: { val: { type: 'string' } } }
                }
              }
            }
          }
        }
      };

      const parsedSpec = makeParsedSpec({
        paths: {
          '/a': {
            get: {
              operationId: 'getA',
              summary: 'Get resource A.',
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: sharedDeep } } } }
            }
          },
          '/b': {
            get: {
              operationId: 'getB',
              summary: 'Get resource B.',
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: sharedDeep } } } }
            }
          },
          '/c': {
            get: {
              operationId: 'getC',
              summary: 'Get resource C.',
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: sharedDeep } } } }
            }
          }
        },
        components: { schemas: { DeepResponse: sharedDeep } }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-001');
      expect(finding).toBeDefined();
      // ONE finding, not three
      expect(finding.count).toBe(1);
      expect(finding.examples[0]).toContain('DeepResponse');
    });
  });

  describe('list endpoint detection (the distinctive risk)', () => {
    it('does NOT flag single-object GET for missing pagination', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/{userId}': {
            get: {
              operationId: 'getUser',
              summary: 'Get a single user by ID.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: FLAT_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-002');
      expect(finding).toBeUndefined();
    });

    it('flags direct-array GET as list endpoint', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users in the system.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: ARRAY_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-002');
      expect(finding).toBeDefined();
    });

    it('flags wrapped-collection GET as list endpoint', () => {
      const wrappedNoPagination = {
        type: 'object',
        properties: {
          results: { type: 'array', items: { type: 'object' } }
        }
      };

      const parsedSpec = makeParsedSpec({
        paths: {
          '/orders': {
            get: {
              operationId: 'listOrders',
              summary: 'List all orders in the system.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: wrappedNoPagination } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-002');
      expect(finding).toBeDefined();
    });
  });

  describe('sub-check 2: pagination support (API-RE-002)', () => {
    it('passes when list endpoint has pagination params', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with pagination.',
              parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer' } },
                { name: 'offset', in: 'query', schema: { type: 'integer' } }
              ],
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: ARRAY_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-002');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 3: total count presence (API-RE-003)', () => {
    it('generates finding when list response lacks total count', () => {
      const noCountSchema = {
        type: 'object',
        properties: { data: { type: 'array', items: { type: 'object' } } }
      };

      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users in the system.',
              parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: noCountSchema } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-003');
      expect(finding).toBeDefined();
    });

    it('passes when list response includes totalCount property', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with pagination.',
              parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: WRAPPED_LIST_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-003');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 4: filter params (API-RE-004)', () => {
    it('generates finding when list endpoint has only pagination params', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with pagination.',
              parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer' } },
                { name: 'offset', in: 'query', schema: { type: 'integer' } }
              ],
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: ARRAY_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-004');
      expect(finding).toBeDefined();
    });

    it('passes when list endpoint has non-pagination filter param', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with filtering.',
              parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer' } },
                { name: 'status', in: 'query', schema: { type: 'string' } }
              ],
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: ARRAY_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-004');
      expect(finding).toBeUndefined();
    });
  });

  describe('Swagger 2.0 (L-PS-3)', () => {
    it('handles schema-on-response for list detection', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users in the system.',
              parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer' } },
                { name: 'role', in: 'query', schema: { type: 'string' } }
              ],
              responses: {
                '200': { description: 'Success', schema: WRAPPED_LIST_SCHEMA }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      // Should detect as list via 2.0 schema-on-response
      const paginationFinding = result.findings.find(f => f.id === 'API-RE-002');
      // Has limit -> passes pagination
      expect(paginationFinding).toBeUndefined();
    });
  });

  describe('per-sub-check applicability gating', () => {
    it('sub-checks 2/3/4 are N/A when no list endpoints exist', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              summary: 'Get a single user by ID.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: FLAT_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      // Only sub-check 1 applies (response schema exists, no list endpoints)
      expect(result.total).toBe(1);
      const f2 = result.findings.find(f => f.id === 'API-RE-002');
      const f3 = result.findings.find(f => f.id === 'API-RE-003');
      const f4 = result.findings.find(f => f.id === 'API-RE-004');
      expect(f2).toBeUndefined();
      expect(f3).toBeUndefined();
      expect(f4).toBeUndefined();
    });
  });

  describe('determinism', () => {
    it('produces identical results on repeated runs', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users in the system.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: ARRAY_SCHEMA } } }
              }
            }
          },
          '/data': {
            get: {
              operationId: 'getData',
              summary: 'Get complex data structure.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: DEEP_SCHEMA } } }
              }
            }
          }
        }
      });

      const run1 = checkResponseEfficiency(parsedSpec);
      const run2 = checkResponseEfficiency(parsedSpec);

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
            get: {
              operationId: 'listUsers',
              summary: 'List all users in the system.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: ARRAY_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);

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
    it('API-RE-001 at count=1: singular primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/data': {
            get: {
              operationId: 'getData',
              summary: 'Get complex data structure.',
              responses: {
                '200': { description: 'Success', content: { 'application/json': { schema: DEEP_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 response schema has');
      expect(finding.text).toContain('this response');
      expect(finding.text).not.toContain('response schemas have');
      expect(finding.text).not.toContain('these responses');
    });

    it('API-RE-001 at count>=2: plural primary and secondary clause', () => {
      const deep2 = {
        type: 'object',
        properties: { a: { type: 'object', properties: { b: { type: 'object', properties: { c: { type: 'string' } } } } } }
      };

      const parsedSpec = makeParsedSpec({
        paths: {
          '/data1': {
            get: {
              operationId: 'getData1',
              summary: 'Get first complex data structure.',
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: DEEP_SCHEMA } } } }
            }
          },
          '/data2': {
            get: {
              operationId: 'getData2',
              summary: 'Get second complex data structure.',
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: deep2 } } } }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.text).toContain('2 response schemas have');
      expect(finding.text).toContain('these responses');
      expect(finding.text).not.toContain('1 response schema has');
      expect(finding.text).not.toContain('this response');
    });

    it('API-RE-002 at count=1: singular primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users in the system.',
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: ARRAY_SCHEMA } } } }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-002');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 list endpoint does');
      expect(finding.text).toContain('this endpoint');
      expect(finding.text).not.toContain('list endpoints do');
      expect(finding.text).not.toContain('these endpoints');
    });

    it('API-RE-002 at count>=2: plural primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users in the system.',
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: ARRAY_SCHEMA } } } }
            }
          },
          '/orders': {
            get: {
              operationId: 'listOrders',
              summary: 'List all orders in the system.',
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: ARRAY_SCHEMA } } } }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-002');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.text).toContain('2 list endpoints do');
      expect(finding.text).toContain('these endpoints');
      expect(finding.text).not.toContain('1 list endpoint does');
      expect(finding.text).not.toContain('this endpoint');
    });

    it('API-RE-003 at count=1: singular primary and secondary clause', () => {
      const noCount = { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } } } };
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users in the system.',
              parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: noCount } } } }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 list endpoint does');
      expect(finding.text).toContain('this endpoint');
      expect(finding.text).not.toContain('list endpoints do');
      expect(finding.text).not.toContain('these endpoints');
    });

    it('API-RE-003 at count>=2: plural primary and secondary clause', () => {
      const noCount = { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } } } };
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users in the system.',
              parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: noCount } } } }
            }
          },
          '/orders': {
            get: {
              operationId: 'listOrders',
              summary: 'List all orders in the system.',
              parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: { ...noCount } } } } }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.text).toContain('2 list endpoints do');
      expect(finding.text).toContain('these endpoints');
      expect(finding.text).not.toContain('1 list endpoint does');
      expect(finding.text).not.toContain('this endpoint');
    });

    it('API-RE-004 at count=1: singular primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with pagination only.',
              parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: ARRAY_SCHEMA } } } }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-004');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 list endpoint offers');
      expect(finding.text).toContain('this endpoint');
      expect(finding.text).not.toContain('list endpoints offer');
      expect(finding.text).not.toContain('these endpoints');
    });

    it('API-RE-004 at count>=2: plural primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users with pagination only.',
              parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: ARRAY_SCHEMA } } } }
            }
          },
          '/orders': {
            get: {
              operationId: 'listOrders',
              summary: 'List all orders with pagination only.',
              parameters: [{ name: 'cursor', in: 'query', schema: { type: 'string' } }],
              responses: { '200': { description: 'OK', content: { 'application/json': { schema: ARRAY_SCHEMA } } } }
            }
          }
        }
      });

      const result = checkResponseEfficiency(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-RE-004');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.text).toContain('2 list endpoints offer');
      expect(finding.text).toContain('these endpoints');
      expect(finding.text).not.toContain('1 list endpoint offers');
      expect(finding.text).not.toContain('this endpoint');
    });
  });
});
