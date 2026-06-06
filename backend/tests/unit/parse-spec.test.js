import { describe, it, expect } from 'vitest';
import { parseSpec } from '../../src/shared/parse-spec.js';

// --- Test fixtures ---

const OPENAPI_3_0_MINIMAL = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {
    '/pets': {
      get: { summary: 'List pets', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Create pet', responses: { '201': { description: 'Created' } } }
    },
    '/pets/{id}': {
      get: { summary: 'Get pet', responses: { '200': { description: 'OK' } } }
    }
  },
  components: {
    schemas: {
      Pet: { type: 'object', properties: { name: { type: 'string' } } }
    }
  }
});

const OPENAPI_3_1 = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Modern API', version: '2.0.0' },
  paths: {
    '/users': { get: { summary: 'List users' } }
  },
  servers: [{ url: 'https://api.example.com' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }
  }
});

const SWAGGER_2_0 = JSON.stringify({
  swagger: '2.0',
  info: { title: 'Legacy API', version: '1.0.0' },
  host: 'api.example.com',
  basePath: '/v1',
  schemes: ['https'],
  paths: {
    '/pets': {
      get: { summary: 'List pets', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Create pet', responses: { '201': { description: 'Created' } } }
    },
    '/pets/{id}': {
      get: { summary: 'Get pet', responses: { '200': { description: 'OK' } } }
    }
  },
  definitions: {
    Pet: { type: 'object', properties: { name: { type: 'string' } } }
  },
  securityDefinitions: {
    apiKey: { type: 'apiKey', name: 'X-API-Key', in: 'header' }
  }
});

// Spec with one schema ($ref'd by 3 endpoints) - Pitfall #2 test
const REUSED_REF_SPEC = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Reuse API', version: '1.0.0' },
  paths: {
    '/dogs': {
      get: {
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Animal' } } } } }
      }
    },
    '/cats': {
      get: {
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Animal' } } } } }
      }
    },
    '/birds': {
      get: {
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Animal' } } } } }
      }
    }
  },
  components: {
    schemas: {
      Animal: { type: 'object', properties: { name: { type: 'string' }, species: { type: 'string' } } }
    }
  }
});

// Circular $ref spec
const CIRCULAR_REF_SPEC = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Circular API', version: '1.0.0' },
  paths: {
    '/nodes': { get: { responses: { '200': { description: 'OK' } } } }
  },
  components: {
    schemas: {
      TreeNode: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          children: { type: 'array', items: { $ref: '#/components/schemas/TreeNode' } }
        }
      }
    }
  }
});

const YAML_SPEC = `openapi: "3.0.0"
info:
  title: YAML API
  version: "1.0.0"
paths:
  /items:
    get:
      summary: List items
      responses:
        "200":
          description: OK
`;

describe('parse-spec', () => {
  describe('OpenAPI 3.0', () => {
    it('parses a minimal OpenAPI 3.0 spec', async () => {
      const { spec, metadata } = await parseSpec(OPENAPI_3_0_MINIMAL);
      expect(spec.openapi).toBe('3.0.0');
      expect(metadata.originalVersion).toBe('3.0.0');
      expect(metadata.title).toBe('Test API');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.endpointCount).toBe(3);
      expect(metadata.schemaCount).toBe(1);
    });
  });

  describe('OpenAPI 3.1', () => {
    it('parses an OpenAPI 3.1 spec', async () => {
      const { spec, metadata } = await parseSpec(OPENAPI_3_1);
      expect(spec.openapi).toBe('3.1.0');
      expect(metadata.originalVersion).toBe('3.1.0');
      expect(metadata.endpointCount).toBe(1);
      expect(metadata.hasServers).toBe(true);
      expect(metadata.hasSecurity).toBe(true);
    });
  });

  describe('Swagger 2.0 conversion', () => {
    it('parses Swagger 2.0 and converts to OpenAPI 3.x shape', async () => {
      const { spec, metadata } = await parseSpec(SWAGGER_2_0);
      expect(spec.openapi).toBe('3.0.0');
      expect(spec.swagger).toBeUndefined();
      expect(metadata.originalVersion).toBe('2.0');
      expect(metadata.title).toBe('Legacy API');
    });

    it('converts host/basePath/schemes to servers', async () => {
      const { spec } = await parseSpec(SWAGGER_2_0);
      expect(spec.servers).toBeDefined();
      expect(spec.servers[0].url).toBe('https://api.example.com/v1');
    });

    it('converts definitions to components.schemas', async () => {
      const { spec } = await parseSpec(SWAGGER_2_0);
      expect(spec.components.schemas.Pet).toBeDefined();
    });

    it('converts securityDefinitions to components.securitySchemes', async () => {
      const { spec, metadata } = await parseSpec(SWAGGER_2_0);
      expect(spec.components.securitySchemes.apiKey).toBeDefined();
      expect(metadata.hasSecurity).toBe(true);
    });
  });

  describe('parity: Swagger 2.0 vs OpenAPI 3.x same API', () => {
    it('produces matching endpointCount and schemaCount', async () => {
      const swagger = await parseSpec(SWAGGER_2_0);
      const openapi = await parseSpec(OPENAPI_3_0_MINIMAL);

      expect(swagger.metadata.endpointCount).toBe(openapi.metadata.endpointCount);
      expect(swagger.metadata.schemaCount).toBe(openapi.metadata.schemaCount);
    });
  });

  describe('Pitfall #2: reused $ref counted once', () => {
    it('counts a schema referenced by 3 endpoints as schemaCount=1', async () => {
      const { metadata } = await parseSpec(REUSED_REF_SPEC);
      // Animal is referenced by /dogs, /cats, /birds but exists once in the registry
      expect(metadata.schemaCount).toBe(1);
      expect(metadata.endpointCount).toBe(3);
    });
  });

  describe('circular $ref handling', () => {
    it('handles circular $ref without hanging', async () => {
      // This test has a 5s implicit timeout from vitest
      const { metadata } = await parseSpec(CIRCULAR_REF_SPEC);
      expect(metadata.schemaCount).toBe(1);
      expect(metadata.endpointCount).toBe(1);
    });
  });

  describe('YAML parsing', () => {
    it('parses a YAML spec', async () => {
      const { metadata } = await parseSpec(YAML_SPEC, 'application/yaml');
      expect(metadata.title).toBe('YAML API');
      expect(metadata.endpointCount).toBe(1);
    });
  });

  describe('metadata fields', () => {
    it('detects hasServers=false when no servers present', async () => {
      const { metadata } = await parseSpec(OPENAPI_3_0_MINIMAL);
      expect(metadata.hasServers).toBe(false);
    });

    it('detects hasSecurity=false when no securitySchemes present', async () => {
      const { metadata } = await parseSpec(OPENAPI_3_0_MINIMAL);
      expect(metadata.hasSecurity).toBe(false);
    });
  });

  describe('error cases', () => {
    it('throws PARSE_INVALID_SPEC for invalid JSON/YAML', async () => {
      await expect(parseSpec('not valid { json or yaml'))
        .rejects.toThrow('could not be parsed as JSON or YAML');
    });

    it('throws PARSE_INVALID_SPEC for valid JSON that is not a spec', async () => {
      await expect(parseSpec('{"name":"bob","age":30}'))
        .rejects.toThrow('does not appear to be an OpenAPI or Swagger specification');
    });

    it('throws PARSE_INVALID_SPEC for empty input', async () => {
      await expect(parseSpec(''))
        .rejects.toThrow('could not be parsed as JSON or YAML');
    });

    it('throws PARSE_UNSUPPORTED_SPEC_VERSION for OpenAPI 4.x', async () => {
      const futureSpec = JSON.stringify({ openapi: '4.0.0', info: { title: 'Future', version: '1.0' }, paths: {} });
      await expect(parseSpec(futureSpec))
        .rejects.toThrow('not supported');
    });
  });
});
