/**
 * Perseus Clew: Unit tests for agent-integration API check module.
 *
 * Covers: happy path, securitySchemes, auth clarity, universal search TRUE
 * positive + FALSE positive guards (per-resource filter, search product title,
 * search product path-density, specific-schema POST /search), SDK informational,
 * externalDocs, applicability, zero-instance, grammar (AI-001/004 fixed-
 * singular, AI-002/003 count-aware), Swagger 2.0, determinism.
 */

import { describe, it, expect } from 'vitest';
import { checkAgentIntegration } from '../../src/checks/api/agent-integration.js';

function makeParsedSpec(specOverrides = {}) {
  return {
    spec: {
      openapi: '3.0.3',
      info: { title: 'Test API', description: 'A test API for unit tests.', version: '1.0.0' },
      paths: {},
      components: { schemas: {}, securitySchemes: {} },
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

describe('checkAgentIntegration', () => {
  describe('zero-instance', () => {
    it('returns full credit when spec has no paths', () => {
      const result = checkAgentIntegration(makeParsedSpec({ paths: {} }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });

    it('returns full credit when paths is undefined', () => {
      const result = checkAgentIntegration(makeParsedSpec({ paths: undefined }));
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('good spec (all sub-checks pass)', () => {
    it('passes with security defined, apiKey clear, externalDocs present, no universal search', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': {
            get: { operationId: 'listUsers', summary: 'List all users.' },
            post: {
              operationId: 'createUser',
              summary: 'Create a new user.',
              requestBody: {
                content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' } }, required: ['email', 'name'] } } }
              }
            }
          }
        },
        components: {
          securitySchemes: {
            apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' }
          }
        },
        externalDocs: { url: 'https://docs.example.com', description: 'API documentation' }
      });

      const result = checkAgentIntegration(parsedSpec);
      expect(result.findings).toHaveLength(0);
      expect(result.passed).toBe(result.total);
    });
  });

  describe('API-AI-001: securitySchemes defined', () => {
    it('generates finding when no securitySchemes exist', () => {
      const parsedSpec = makeParsedSpec({
        paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
        components: {},
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-001');
      expect(finding).toBeDefined();
      expect(finding.count).toBeNull();
    });

    it('passes when securitySchemes has entries', () => {
      const parsedSpec = makeParsedSpec({
        paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-001');
      expect(finding).toBeUndefined();
    });
  });

  describe('API-AI-002: auth scheme clarity', () => {
    it('generates finding when apiKey scheme lacks in/name', () => {
      const parsedSpec = makeParsedSpec({
        paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
        components: { securitySchemes: { myKey: { type: 'apiKey' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-002');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.examples).toContain('myKey');
    });

    it('passes when apiKey scheme has in and name', () => {
      const parsedSpec = makeParsedSpec({
        paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
        components: { securitySchemes: { myKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-002');
      expect(finding).toBeUndefined();
    });

    it('is N/A when no apiKey schemes exist (only bearer)', () => {
      const parsedSpec = makeParsedSpec({
        paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-002');
      expect(finding).toBeUndefined();
    });
  });

  describe('API-AI-003: universal search detection', () => {
    it('TRUE POSITIVE: flags CRUD API with bolted-on POST /search and generic body', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': { get: { operationId: 'listUsers', summary: 'List users.' } },
          '/users/{id}': { get: { operationId: 'getUser', summary: 'Get user.' } },
          '/search': {
            post: {
              operationId: 'universalSearch',
              summary: 'Search everything.',
              requestBody: {
                content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' } } } } }
              }
            }
          }
        },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-003');
      expect(finding).toBeDefined();
      expect(finding.count).toBe(1);
      expect(finding.examples).toContain('POST /search');
    });

    it('FALSE POSITIVE GUARD: per-resource GET filter NOT flagged', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/orders': {
            get: {
              operationId: 'listOrders',
              summary: 'List orders.',
              parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }]
            }
          }
        },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-003');
      expect(finding).toBeUndefined();
    });

    it('FALSE POSITIVE GUARD: search product (title) NOT flagged', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'Elastic Search API', description: 'Full-text search engine.', version: '8.0.0' },
        paths: {
          '/search': {
            post: {
              operationId: 'search',
              summary: 'Execute a search query.',
              requestBody: {
                content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'object' } } } } }
              }
            }
          }
        },
        components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'Authorization' } } },
        externalDocs: { url: 'https://elastic.co/docs' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-003');
      expect(finding).toBeUndefined();
    });

    it('FALSE POSITIVE GUARD: search product (path density >50%) NOT flagged', () => {
      const parsedSpec = makeParsedSpec({
        info: { title: 'Algolia API', description: 'Hosted search platform.', version: '1.0.0' },
        paths: {
          '/indexes/{indexName}/search': {
            post: {
              operationId: 'searchIndex',
              summary: 'Search an index.',
              requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' } } } } } }
            }
          },
          '/indexes/{indexName}/query': {
            post: {
              operationId: 'queryIndex',
              summary: 'Query an index.',
              requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { filters: { type: 'string' } } } } } }
            }
          },
          '/indexes': {
            get: { operationId: 'listIndexes', summary: 'List all indexes.' }
          }
        },
        components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'X-Algolia-API-Key' } } },
        externalDocs: { url: 'https://algolia.com/doc' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-003');
      expect(finding).toBeUndefined();
    });

    it('FALSE POSITIVE GUARD: specific-schema POST /users/search NOT flagged', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users/search': {
            post: {
              operationId: 'searchUsers',
              summary: 'Search users by criteria.',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        email: { type: 'string' },
                        role: { type: 'string', enum: ['admin', 'user'] },
                        createdAfter: { type: 'string', format: 'date' }
                      },
                      required: ['email']
                    }
                  }
                }
              }
            }
          }
        },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-003');
      expect(finding).toBeUndefined();
    });

    it('is N/A when no POST operations exist', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': { get: { operationId: 'listUsers', summary: 'List users.' } }
        },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-003');
      expect(finding).toBeUndefined();
    });

    it('handles empty request body schema as generic', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': { get: { operationId: 'listUsers', summary: 'List users.' } },
          '/search': {
            post: {
              operationId: 'search',
              summary: 'Search.',
              requestBody: {
                content: { 'application/json': { schema: { type: 'object' } } }
              }
            }
          }
        },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-003');
      expect(finding).toBeDefined();
    });

    it('does not flag POST /search with no body schema (benefit of doubt)', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/search': {
            post: { operationId: 'search', summary: 'Search.' }
          }
        },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-003');
      expect(finding).toBeUndefined();
    });

    it('handles Swagger 2.0 in:body parameter for generic body detection', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': { get: { operationId: 'listUsers', summary: 'List users.' } },
          '/search': {
            post: {
              operationId: 'search',
              summary: 'Search.',
              parameters: [
                { name: 'body', in: 'body', schema: { type: 'object', properties: { q: { type: 'string' } } } }
              ]
            }
          }
        },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-003');
      expect(finding).toBeDefined();
    });
  });

  describe('API-AI-004: externalDocs presence', () => {
    it('generates finding when externalDocs is missing', () => {
      const parsedSpec = makeParsedSpec({
        paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-004');
      expect(finding).toBeDefined();
      expect(finding.count).toBeNull();
    });

    it('passes when externalDocs has a URL', () => {
      const parsedSpec = makeParsedSpec({
        paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const finding = result.findings.find(f => f.id === 'API-AI-004');
      expect(finding).toBeUndefined();
    });
  });

  describe('SDK informational does NOT touch total', () => {
    it('does not generate a finding or affect total regardless of SDK mentions', () => {
      const parsedSpec = makeParsedSpec({
        paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      const sdkFinding = result.findings.find(f => f.text.toLowerCase().includes('sdk'));
      expect(sdkFinding).toBeUndefined();
    });
  });

  describe('per-sub-check applicability', () => {
    it('SC2 not counted when no apiKey schemes exist', () => {
      const parsedSpec = makeParsedSpec({
        paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      // SC1 (security: pass) + SC4 (externalDocs: pass) = 2
      // SC2 N/A (no apiKey), SC3 N/A (no POST ops)
      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
    });

    it('SC3 not counted when no POST operations exist', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': { get: { operationId: 'listUsers', summary: 'List users.' } },
          '/users/{id}': { get: { operationId: 'getUser', summary: 'Get user.' } }
        },
        components: { securitySchemes: { myKey: { type: 'apiKey', in: 'header', name: 'X-Key' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);
      // SC1 + SC2 + SC4 = 3 (no POST -> SC3 N/A)
      expect(result.total).toBe(3);
    });
  });

  describe('determinism', () => {
    it('produces identical results on repeated runs', () => {
      const parsedSpec = makeParsedSpec({
        paths: {
          '/users': { get: { operationId: 'listUsers', summary: 'List users.' } },
          '/search': {
            post: {
              operationId: 'search',
              summary: 'Search.',
              requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' } } } } } }
            }
          }
        },
        components: {},
        externalDocs: { url: 'https://docs.example.com' }
      });

      const run1 = checkAgentIntegration(parsedSpec);
      const run2 = checkAgentIntegration(parsedSpec);

      expect(run1.passed).toBe(run2.passed);
      expect(run1.total).toBe(run2.total);
      expect(run1.findings).toEqual(run2.findings);
    });
  });

  describe('contract shape', () => {
    it('returns { passed, total, findings } matching 1C contract', () => {
      const parsedSpec = makeParsedSpec({
        paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        externalDocs: { url: 'https://docs.example.com' }
      });

      const result = checkAgentIntegration(parsedSpec);

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
    describe('API-AI-001 (fixed-singular: securitySchemes verdict)', () => {
      it('produces a fixed singular string with no count template', () => {
        const parsedSpec = makeParsedSpec({
          paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
          components: {},
          externalDocs: { url: 'https://docs.example.com' }
        });

        const result = checkAgentIntegration(parsedSpec);
        const finding = result.findings.find(f => f.id === 'API-AI-001');
        expect(finding).toBeDefined();
        expect(finding.count).toBeNull();
        expect(finding.text).toBe(
          'The spec does not define any security schemes. An agent attempting to authenticate cannot determine what credentials are required or how to provide them.'
        );
      });
    });

    describe('API-AI-002 (count-aware: one or many apiKey schemes lacking clarity)', () => {
      it('at count=1: singular primary and secondary clause', () => {
        const parsedSpec = makeParsedSpec({
          paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
          components: { securitySchemes: { myKey: { type: 'apiKey' } } },
          externalDocs: { url: 'https://docs.example.com' }
        });

        const result = checkAgentIntegration(parsedSpec);
        const finding = result.findings.find(f => f.id === 'API-AI-002');
        expect(finding).toBeDefined();
        expect(finding.count).toBe(1);
        expect(finding.text).toContain('1 API key security scheme does');
        expect(finding.text).toContain('this scheme');
        expect(finding.text).not.toContain('API key security schemes do');
        expect(finding.text).not.toContain('these schemes');
      });

      it('at count>=2: plural primary and secondary clause', () => {
        const parsedSpec = makeParsedSpec({
          paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
          components: { securitySchemes: { keyA: { type: 'apiKey' }, keyB: { type: 'apiKey' } } },
          externalDocs: { url: 'https://docs.example.com' }
        });

        const result = checkAgentIntegration(parsedSpec);
        const finding = result.findings.find(f => f.id === 'API-AI-002');
        expect(finding).toBeDefined();
        expect(finding.count).toBe(2);
        expect(finding.text).toContain('2 API key security schemes do');
        expect(finding.text).toContain('these schemes');
        expect(finding.text).not.toContain('1 API key security scheme does');
        expect(finding.text).not.toContain('this scheme');
      });
    });

    describe('API-AI-003 (count-aware: one or many universal search endpoints)', () => {
      it('at count=1: singular primary and secondary clause', () => {
        const parsedSpec = makeParsedSpec({
          paths: {
            '/users': { get: { operationId: 'listUsers', summary: 'List users.' } },
            '/search': {
              post: {
                operationId: 'search',
                summary: 'Search.',
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' } } } } } }
              }
            }
          },
          components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
          externalDocs: { url: 'https://docs.example.com' }
        });

        const result = checkAgentIntegration(parsedSpec);
        const finding = result.findings.find(f => f.id === 'API-AI-003');
        expect(finding).toBeDefined();
        expect(finding.count).toBe(1);
        expect(finding.text).toContain('1 universal search endpoint accepts');
        expect(finding.text).toContain('this endpoint');
        expect(finding.text).not.toContain('endpoints accept');
        expect(finding.text).not.toContain('these endpoints');
      });

      it('at count>=2: plural primary and secondary clause', () => {
        const parsedSpec = makeParsedSpec({
          paths: {
            '/users': { get: { operationId: 'listUsers', summary: 'List users.' } },
            '/orders': { get: { operationId: 'listOrders', summary: 'List orders.' } },
            '/products': { get: { operationId: 'listProducts', summary: 'List products.' } },
            '/search': {
              post: {
                operationId: 'search',
                summary: 'Search all.',
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' } } } } } }
              }
            },
            '/query': {
              post: {
                operationId: 'query',
                summary: 'Query all.',
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { q: { type: 'string' } } } } } }
              }
            }
          },
          components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
          externalDocs: { url: 'https://docs.example.com' }
        });

        const result = checkAgentIntegration(parsedSpec);
        const finding = result.findings.find(f => f.id === 'API-AI-003');
        expect(finding).toBeDefined();
        expect(finding.count).toBe(2);
        expect(finding.text).toContain('2 universal search endpoints accept');
        expect(finding.text).toContain('these endpoints');
        expect(finding.text).not.toContain('1 universal search endpoint accepts');
        expect(finding.text).not.toContain('this endpoint');
      });
    });

    describe('API-AI-004 (fixed-singular: externalDocs verdict)', () => {
      it('produces a fixed singular string with no count template', () => {
        const parsedSpec = makeParsedSpec({
          paths: { '/users': { get: { operationId: 'listUsers', summary: 'List users.' } } },
          components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } }
        });

        const result = checkAgentIntegration(parsedSpec);
        const finding = result.findings.find(f => f.id === 'API-AI-004');
        expect(finding).toBeDefined();
        expect(finding.count).toBeNull();
        expect(finding.text).toBe(
          'The spec does not link to external documentation. An agent encountering ambiguity has no reference to consult beyond the spec itself.'
        );
      });
    });
  });
});
