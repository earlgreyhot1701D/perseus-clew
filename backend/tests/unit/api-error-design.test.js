/**
 * Perseus Clew: Unit tests for error-design API check module.
 *
 * Covers: happy path, bad path, Pitfall #2 (shared schema scored once),
 * cycle-safety, zero-instance, per-sub-check applicability, full-sentence
 * grammar at count=1 and count>=2, determinism, Swagger 2.0 graceful handling.
 */

import { describe, it, expect } from 'vitest';
import { checkErrorDesign } from '../../src/checks/api/error-design.js';

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

/** RFC 9457 Problem Details error schema. */
const RFC9457_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string' }
  }
};

/** Custom error schema with errors array. */
const ERRORS_ARRAY_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    errors: { type: 'array', items: { type: 'object' } }
  }
};

/** Minimal message-only schema (no field identification). */
const MESSAGE_ONLY_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' }
  }
};

describe('checkErrorDesign', () => {
  describe('zero-instance', () => {
    it('returns full credit when spec has no paths', () => {
      const result = checkErrorDesign(makeParsedSpec({ paths: {} }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });

    it('returns full credit when paths is undefined', () => {
      const result = checkErrorDesign(makeParsedSpec({ paths: undefined }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('good spec (all sub-checks pass)', () => {
    it('passes all sub-checks for well-documented error responses', () => {
      const parsedSpec = makeParsedSpec({
        security: [{ bearerAuth: [] }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '401': {
                  description: 'Unauthorized',
                  content: { 'application/problem+json': { schema: RFC9457_SCHEMA } }
                }
              }
            },
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' },
                '400': {
                  description: 'Validation error',
                  content: { 'application/problem+json': { schema: RFC9457_SCHEMA } }
                },
                '401': {
                  description: 'Unauthorized',
                  content: { 'application/problem+json': { schema: RFC9457_SCHEMA } }
                }
              }
            }
          },
          '/users/{userId}': {
            get: {
              operationId: 'getUser',
              summary: 'Retrieve a single user by their unique identifier.',
              responses: {
                '200': { description: 'Success' },
                '401': {
                  description: 'Unauthorized',
                  content: { 'application/problem+json': { schema: RFC9457_SCHEMA } }
                },
                '404': {
                  description: 'Not found',
                  content: { 'application/problem+json': { schema: RFC9457_SCHEMA } }
                }
              }
            }
          }
        },
        components: {
          schemas: { ProblemDetails: RFC9457_SCHEMA },
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      expect(result.findings).toHaveLength(0);
      expect(result.passed).toBe(result.total);
    });
  });

  describe('sub-check 1: 4xx response documented (API-ED-001)', () => {
    it('generates finding when no 4xx responses are documented', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.examples).toContain('GET /users');
    });

    it('passes when 4xx response is documented', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Bad request' }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-001');
      expect(finding).toBeUndefined();
    });

    it('handles integer response codes (Swagger 2.0 edge)', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                200: { description: 'Success' },
                400: { description: 'Bad request' }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-001');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 2: error schema present (API-ED-002)', () => {
    it('generates finding when 4xx response has no schema', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Bad request' }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-002');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
    });

    it('passes when 4xx response has a schema', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': {
                  description: 'Bad request',
                  content: { 'application/json': { schema: MESSAGE_ONLY_SCHEMA } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-002');
      expect(finding).toBeUndefined();
    });

    it('handles Swagger 2.0 schema-on-response (L-PS-3)', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '400': {
                  description: 'Bad request',
                  schema: MESSAGE_ONLY_SCHEMA
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-002');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 3: field-level error info (API-ED-003)', () => {
    it('generates finding when error schema lacks field identification', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' },
                '400': {
                  description: 'Bad request',
                  content: { 'application/json': { schema: MESSAGE_ONLY_SCHEMA } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
    });

    it('passes for RFC 9457 Problem Details schema', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' },
                '400': {
                  description: 'Validation error',
                  content: { 'application/problem+json': { schema: RFC9457_SCHEMA } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-003');
      expect(finding).toBeUndefined();
    });

    it('passes for errors-array schema', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' },
                '400': {
                  description: 'Validation error',
                  content: { 'application/json': { schema: ERRORS_ARRAY_SCHEMA } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-003');
      expect(finding).toBeUndefined();
    });

    it('passes for schema with field property', () => {
      const fieldSchema = {
        type: 'object',
        properties: {
          message: { type: 'string' },
          field: { type: 'string' }
        }
      };

      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' },
                '400': {
                  description: 'Validation error',
                  content: { 'application/json': { schema: fieldSchema } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-003');
      expect(finding).toBeUndefined();
    });
  });

  describe('sub-check 4: error structure consistency (API-ED-004)', () => {
    it('passes when all error schemas use the same structure', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': {
                  description: 'Error',
                  content: { 'application/problem+json': { schema: RFC9457_SCHEMA } }
                }
              }
            },
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' },
                '422': {
                  description: 'Validation error',
                  content: { 'application/problem+json': { schema: RFC9457_SCHEMA } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-004');
      expect(finding).toBeUndefined();
    });

    it('generates finding when error schemas use different structures', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': {
                  description: 'Error',
                  content: { 'application/json': { schema: MESSAGE_ONLY_SCHEMA } }
                }
              }
            },
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' },
                '422': {
                  description: 'Validation error',
                  content: { 'application/problem+json': { schema: RFC9457_SCHEMA } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-004');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
    });
  });

  describe('sub-check 5: common-error completeness (API-ED-005)', () => {
    it('generates finding for auth-protected endpoint missing 401', () => {
      const parsedSpec = makeParsedSpec({
        security: [{ bearerAuth: [] }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Bad request', content: { 'application/json': { schema: MESSAGE_ONLY_SCHEMA } } }
              }
            }
          }
        },
        components: {
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-005');
      expect(finding).toBeDefined();
      expect(finding.examples.some(e => e.includes('missing 401'))).toBe(true);
    });

    it('generates finding for input-accepting endpoint missing 400/422', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-005');
      expect(finding).toBeDefined();
      expect(finding.examples.some(e => e.includes('missing 400/422'))).toBe(true);
    });

    it('generates finding for resource endpoint missing 404', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/{userId}': {
            get: {
              operationId: 'getUser',
              summary: 'Retrieve a single user by their unique identifier.',
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-005');
      expect(finding).toBeDefined();
      expect(finding.examples.some(e => e.includes('missing 404'))).toBe(true);
    });

    it('passes when all common errors are documented', () => {
      const parsedSpec = makeParsedSpec({
        security: [{ bearerAuth: [] }],
        paths: {
          '/users/{userId}': {
            get: {
              operationId: 'getUser',
              summary: 'Retrieve a single user by their unique identifier.',
              responses: {
                '200': { description: 'Success' },
                '401': { description: 'Unauthorized', content: { 'application/json': { schema: RFC9457_SCHEMA } } },
                '404': { description: 'Not found', content: { 'application/json': { schema: RFC9457_SCHEMA } } }
              }
            }
          }
        },
        components: {
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-005');
      expect(finding).toBeUndefined();
    });
  });

  describe('Pitfall #2: shared error schema scored once', () => {
    it('counts shared error schema once even when referenced from many endpoints', () => {
      const sharedErrorSchema = {
        type: 'object',
        properties: {
          message: { type: 'string' }
        }
      };

      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Error', content: { 'application/json': { schema: sharedErrorSchema } } }
              }
            }
          },
          '/orders': {
            get: {
              operationId: 'listOrders',
              summary: 'List orders with filtering and date support.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Error', content: { 'application/json': { schema: sharedErrorSchema } } }
              }
            }
          },
          '/products': {
            get: {
              operationId: 'listProducts',
              summary: 'List products with category filtering support.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Error', content: { 'application/json': { schema: sharedErrorSchema } } }
              }
            }
          }
        },
        components: {
          schemas: {
            ErrorResponse: sharedErrorSchema
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-003');
      // Should be 1 finding (ErrorResponse scored once), not 3
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.examples[0]).toBe('ErrorResponse');
    });
  });

  describe('cycle-safety', () => {
    it('does not hang on circular error schemas', () => {
      const circularSchema = {
        type: 'object',
        properties: {
          message: { type: 'string' },
          nested: null
        }
      };
      circularSchema.properties.nested = circularSchema;

      const parsedSpec = makeParsedSpec({
        paths: {
          '/test': {
            get: {
              operationId: 'test',
              summary: 'A test endpoint for cycle safety validation.',
              responses: {
                '200': { description: 'Success' },
                '400': {
                  description: 'Error',
                  content: { 'application/json': { schema: circularSchema } }
                }
              }
            }
          }
        }
      });

      // Should complete without hanging
      const result = checkErrorDesign(parsedSpec);
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('findings');
    });
  });

  describe('per-sub-check applicability gating', () => {
    it('sub-checks 2/3/4 are N/A when no 4xx responses documented at all', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      // Only sub-checks 1 and 5 are applicable (2 total)
      expect(result.total).toBe(2);
    });

    it('sub-checks 3/4 are N/A when 4xx responses have no schemas', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Bad request' }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      // Sub-checks 1 (pass), 2 (applicable: 4xx exists, no schema = finding), 5. Total = 3
      expect(result.total).toBe(3);
    });

    it('sub-check 4 is N/A when only one 4xx schema exists (nothing to compare)', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': {
                  description: 'Bad request',
                  content: { 'application/json': { schema: RFC9457_SCHEMA } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      // Sub-checks 1, 2, 3, 5 applicable (4 total). Sub-check 4 N/A (only one schema).
      expect(result.total).toBe(4);
    });
  });

  describe('determinism', () => {
    it('produces identical results on repeated runs', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: { '200': { description: 'Success' } }
            },
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' },
                '400': {
                  description: 'Error',
                  content: { 'application/json': { schema: MESSAGE_ONLY_SCHEMA } }
                }
              }
            }
          }
        }
      });

      const run1 = checkErrorDesign(parsedSpec);
      const run2 = checkErrorDesign(parsedSpec);

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
              summary: 'A test endpoint for contract shape verification.',
              responses: {
                '200': { description: 'Success' },
                '400': {
                  description: 'Error',
                  content: { 'application/json': { schema: RFC9457_SCHEMA } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);

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
    it('API-ED-001 at count=1: singular primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 operation documents');
      expect(finding.text).toContain('this endpoint');
      expect(finding.text).not.toContain('operations document');
      expect(finding.text).not.toContain('these endpoints');
    });

    it('API-ED-001 at count>=2: plural primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: { '200': { description: 'Success' } }
            }
          },
          '/orders': {
            get: {
              operationId: 'listOrders',
              summary: 'List orders with filtering and date support.',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.text).toContain('2 operations document');
      expect(finding.text).toContain('these endpoints');
      expect(finding.text).not.toContain('1 operation documents');
      expect(finding.text).not.toContain('this endpoint');
    });

    it('API-ED-002 at count=1: singular primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Bad request' }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-002');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 documented 4xx error response has');
      expect(finding.text).toContain('this response');
      expect(finding.text).not.toContain('error responses have');
      expect(finding.text).not.toContain('these responses');
    });

    it('API-ED-002 at count>=2: plural primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Bad request' },
                '404': { description: 'Not found' }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-002');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.text).toContain('2 documented 4xx error responses have');
      expect(finding.text).toContain('these responses');
      expect(finding.text).not.toContain('error response has');
      expect(finding.text).not.toContain('this response');
    });

    it('API-ED-003 at count=1: singular primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' },
                '400': {
                  description: 'Bad request',
                  content: { 'application/json': { schema: MESSAGE_ONLY_SCHEMA } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 error schema does');
      expect(finding.text).toContain('this error');
      expect(finding.text).not.toContain('error schemas do');
      expect(finding.text).not.toContain('these errors');
    });

    it('API-ED-003 at count>=2: plural primary and secondary clause', () => {
      const messageCodeSchema = {
        type: 'object',
        properties: { message: { type: 'string' }, code: { type: 'integer' } }
      };

      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users with filtering and pagination support.',
              responses: {
                '200': { description: 'Success' },
                '400': {
                  description: 'Error',
                  content: { 'application/json': { schema: MESSAGE_ONLY_SCHEMA } }
                }
              }
            },
            post: {
              operationId: 'createUser',
              summary: 'Create a new user account in the system.',
              requestBody: { content: { 'application/json': { schema: {} } } },
              responses: {
                '201': { description: 'Created' },
                '422': {
                  description: 'Validation error',
                  content: { 'application/json': { schema: messageCodeSchema } }
                }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(2);
      expect(finding.text).toContain('2 error schemas do');
      expect(finding.text).toContain('these errors');
      expect(finding.text).not.toContain('1 error schema does');
      expect(finding.text).not.toContain('this error');
    });

    it('API-ED-005 at count=1: singular primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/{userId}': {
            get: {
              operationId: 'getUser',
              summary: 'Retrieve a single user by their unique identifier.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Error', content: { 'application/json': { schema: RFC9457_SCHEMA } } }
              }
            }
          }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-005');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.text).toContain('1 operation is');
      expect(finding.text).toContain('that endpoint');
      expect(finding.text).not.toContain('operations are');
      expect(finding.text).not.toContain('those endpoints');
    });

    it('API-ED-005 at count>=2: plural primary and secondary clause', () => {
      const parsedSpec = makeParsedSpec({
        security: [{ bearerAuth: [] }],
        paths: {
          '/users/{userId}': {
            get: {
              operationId: 'getUser',
              summary: 'Retrieve a single user by their unique identifier.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Error', content: { 'application/json': { schema: RFC9457_SCHEMA } } }
              }
            }
          },
          '/orders/{orderId}': {
            get: {
              operationId: 'getOrder',
              summary: 'Retrieve a single order by its unique identifier.',
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Error', content: { 'application/json': { schema: RFC9457_SCHEMA } } }
              }
            }
          }
        },
        components: {
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }
        }
      });

      const result = checkErrorDesign(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-ED-005');
      expect(finding).toBeDefined();
      expect(finding.count).toBeGreaterThanOrEqual(2);
      expect(finding.text).toContain('operations are');
      expect(finding.text).toContain('those endpoints');
      expect(finding.text).not.toContain('1 operation is');
      expect(finding.text).not.toContain('that endpoint');
    });
  });
});
