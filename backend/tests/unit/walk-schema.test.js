/**
 * Perseus Clew: Unit tests for walk-schema utility.
 *
 * Covers: basic traversal, cycle-safety (WeakSet on object identity),
 * composition keywords (allOf/oneOf/anyOf), property counting,
 * nesting depth measurement, and registry-key lookup.
 */

import { describe, it, expect } from 'vitest';
import {
  walkSchema,
  countTopLevelProperties,
  measureNestingDepth,
  getRegistryKeyName
} from '../../src/checks/api/walk-schema.js';

describe('walkSchema', () => {
  it('visits a flat schema with properties', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        email: { type: 'string' }
      }
    };

    const visited = [];
    walkSchema(schema, (node, depth) => visited.push({ node, depth }));

    // Root + 3 properties = 4 nodes
    expect(visited).toHaveLength(4);
    expect(visited[0].depth).toBe(0);
    expect(visited[1].depth).toBe(1);
  });

  it('visits nested schemas with correct depth', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            city: { type: 'string' },
            geo: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' }
              }
            }
          }
        }
      }
    };

    const depths = [];
    walkSchema(schema, (_node, depth) => depths.push(depth));

    // root(0), address(1), city(2), geo(2), lat(3), lng(3)
    expect(depths).toEqual([0, 1, 2, 2, 3, 3]);
  });

  it('handles array items', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' }
        }
      }
    };

    const visited = [];
    walkSchema(schema, (node) => visited.push(node));

    // root array + items object + id property = 3
    expect(visited).toHaveLength(3);
  });

  it('handles additionalProperties', () => {
    const schema = {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          value: { type: 'string' }
        }
      }
    };

    const visited = [];
    walkSchema(schema, (node) => visited.push(node));

    // root + additionalProperties object + value property = 3
    expect(visited).toHaveLength(3);
  });

  it('handles allOf composition at same depth', () => {
    const schema = {
      allOf: [
        { type: 'object', properties: { id: { type: 'integer' } } },
        { type: 'object', properties: { name: { type: 'string' } } }
      ]
    };

    const depths = [];
    walkSchema(schema, (_node, depth) => depths.push(depth));

    // root(0), allOf[0](0), id(1), allOf[1](0), name(1)
    expect(depths).toEqual([0, 0, 1, 0, 1]);
  });

  it('handles oneOf and anyOf', () => {
    const schema = {
      oneOf: [
        { type: 'string' },
        { type: 'integer' }
      ],
      anyOf: [
        { type: 'boolean' }
      ]
    };

    const visited = [];
    walkSchema(schema, (node) => visited.push(node));

    // root + 2 oneOf + 1 anyOf = 4
    expect(visited).toHaveLength(4);
  });

  it('stops at circular references (cycle-safety)', () => {
    const schema = {
      type: 'object',
      properties: {}
    };
    // Create a circular reference: schema.properties.self -> schema
    schema.properties.self = schema;

    const visited = [];
    walkSchema(schema, (node) => visited.push(node));

    // Should visit schema once only, not infinite loop
    expect(visited).toHaveLength(1);
  });

  it('stops at deep circular references', () => {
    const leaf = { type: 'object', properties: {} };
    const middle = { type: 'object', properties: { child: leaf } };
    const root = { type: 'object', properties: { mid: middle } };
    // Circle: leaf points back to root
    leaf.properties.parent = root;

    const visited = [];
    walkSchema(root, (node) => visited.push(node));

    // root, middle, leaf (stops when hitting root again)
    expect(visited).toHaveLength(3);
  });

  it('handles null and undefined gracefully', () => {
    const visited = [];
    walkSchema(null, (node) => visited.push(node));
    walkSchema(undefined, (node) => visited.push(node));
    expect(visited).toHaveLength(0);
  });

  it('handles non-object schema gracefully', () => {
    const visited = [];
    walkSchema('string', (node) => visited.push(node));
    walkSchema(42, (node) => visited.push(node));
    expect(visited).toHaveLength(0);
  });

  it('is deterministic (same input, same visit order)', () => {
    const schema = {
      type: 'object',
      properties: {
        alpha: { type: 'string' },
        beta: { type: 'integer' },
        gamma: { type: 'boolean' }
      }
    };

    const run1 = [];
    const run2 = [];
    walkSchema(schema, (node) => run1.push(node));
    walkSchema(schema, (node) => run2.push(node));

    expect(run1).toEqual(run2);
  });
});

describe('countTopLevelProperties', () => {
  it('counts properties at top level', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        email: { type: 'string' }
      }
    };

    expect(countTopLevelProperties(schema)).toBe(3);
  });

  it('returns 0 for schema without properties', () => {
    expect(countTopLevelProperties({ type: 'string' })).toBe(0);
    expect(countTopLevelProperties({})).toBe(0);
  });

  it('returns 0 for null/undefined', () => {
    expect(countTopLevelProperties(null)).toBe(0);
    expect(countTopLevelProperties(undefined)).toBe(0);
  });

  it('does not count nested properties', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            city: { type: 'string' },
            zip: { type: 'string' }
          }
        }
      }
    };

    // Only 1 top-level property (address), not 3
    expect(countTopLevelProperties(schema)).toBe(1);
  });
});

describe('measureNestingDepth', () => {
  it('returns 0 for flat schema', () => {
    const schema = { type: 'string' };
    expect(measureNestingDepth(schema)).toBe(0);
  });

  it('returns 1 for one level of nested properties', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' }
      }
    };
    expect(measureNestingDepth(schema)).toBe(1);
  });

  it('returns correct depth for deeply nested schemas', () => {
    const schema = {
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
    };

    expect(measureNestingDepth(schema)).toBe(3);
  });

  it('handles circular schemas without infinite loop', () => {
    const schema = { type: 'object', properties: {} };
    schema.properties.self = schema;

    // Visits root at depth 0 only (self is a cycle)
    expect(measureNestingDepth(schema)).toBe(0);
  });

  it('measures depth through array items', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' }
        }
      }
    };

    // root(0) -> items(1) -> id(2)
    expect(measureNestingDepth(schema)).toBe(2);
  });
});

describe('getRegistryKeyName', () => {
  it('returns the key name for a registered schema', () => {
    const userSchema = { type: 'object', properties: { id: { type: 'integer' } } };
    const spec = {
      components: {
        schemas: {
          User: userSchema
        }
      }
    };

    expect(getRegistryKeyName(spec, userSchema)).toBe('User');
  });

  it('returns null for an inline (non-registered) schema', () => {
    const userSchema = { type: 'object', properties: { id: { type: 'integer' } } };
    const inlineSchema = { type: 'object', properties: { name: { type: 'string' } } };
    const spec = {
      components: {
        schemas: {
          User: userSchema
        }
      }
    };

    expect(getRegistryKeyName(spec, inlineSchema)).toBeNull();
  });

  it('returns null when spec has no components', () => {
    const schema = { type: 'object' };
    const spec = {};

    expect(getRegistryKeyName(spec, schema)).toBeNull();
  });

  it('returns null when spec has no schemas', () => {
    const schema = { type: 'object' };
    const spec = { components: {} };

    expect(getRegistryKeyName(spec, schema)).toBeNull();
  });

  it('matches by object identity, not structural equality', () => {
    const schemaA = { type: 'object', properties: { id: { type: 'integer' } } };
    const schemaB = { type: 'object', properties: { id: { type: 'integer' } } };
    const spec = {
      components: {
        schemas: {
          User: schemaA
        }
      }
    };

    // schemaB is structurally identical but a different object
    expect(getRegistryKeyName(spec, schemaA)).toBe('User');
    expect(getRegistryKeyName(spec, schemaB)).toBeNull();
  });
});
