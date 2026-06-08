/**
 * Perseus Clew: Schema walking utility for API check modules.
 *
 * Provides cycle-safe traversal of dereferenced OpenAPI schemas.
 * SwaggerParser.dereference() produces actual JS circular references
 * (object A → property → object A). This utility uses a WeakSet on
 * object identity to detect cycles and stop recursion.
 *
 * Used by: naming-descriptions, error-design, response-efficiency,
 * reliability-patterns.
 *
 * See Block 1G proposal, section 2 (Cycle-Safety Strategy).
 */

/**
 * Walk a schema tree depth-first, calling visitor on each schema node.
 * Stops at circular references (same object visited twice).
 *
 * @param {object|null|undefined} schema - The schema node to walk
 * @param {function} visitor - Called with (schemaNode, depth) for each node
 * @param {WeakSet} [visited] - Internal cycle-detection set
 * @param {number} [depth] - Current nesting depth (starts at 0)
 */
export function walkSchema(schema, visitor, visited = new WeakSet(), depth = 0) {
  if (!schema || typeof schema !== 'object') return;
  if (visited.has(schema)) return;
  visited.add(schema);

  visitor(schema, depth);

  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      walkSchema(prop, visitor, visited, depth + 1);
    }
  }

  if (schema.items) {
    walkSchema(schema.items, visitor, visited, depth + 1);
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    walkSchema(schema.additionalProperties, visitor, visited, depth + 1);
  }

  // allOf / oneOf / anyOf composition
  for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[keyword])) {
      for (const subSchema of schema[keyword]) {
        walkSchema(subSchema, visitor, visited, depth);
      }
    }
  }
}

/**
 * Count the top-level properties of a schema (depth 0 only).
 * Cycle-safe.
 *
 * @param {object} schema - The schema to count properties for
 * @returns {number} Number of top-level properties
 */
export function countTopLevelProperties(schema) {
  if (!schema || typeof schema !== 'object') return 0;
  if (!schema.properties) return 0;
  return Object.keys(schema.properties).length;
}

/**
 * Measure the maximum nesting depth of a schema.
 * Cycle-safe. Returns 0 for flat schemas, 1 for one level of
 * nested objects, etc.
 *
 * @param {object} schema - The schema to measure
 * @returns {number} Maximum nesting depth
 */
export function measureNestingDepth(schema) {
  let maxDepth = 0;
  walkSchema(schema, (_node, depth) => {
    if (depth > maxDepth) maxDepth = depth;
  });
  return maxDepth;
}

/**
 * Check whether a schema name is a key in the components.schemas registry.
 * Used for Pitfall #2 defense: named schemas are scored once, not per-reference.
 *
 * @param {object} spec - The full parsed OpenAPI spec
 * @param {object} schemaObj - The schema object to check (by identity)
 * @returns {string|null} The registry key name if found, null otherwise
 */
export function getRegistryKeyName(spec, schemaObj) {
  const schemas = spec.components?.schemas;
  if (!schemas) return null;

  for (const [name, registered] of Object.entries(schemas)) {
    if (registered === schemaObj) return name;
  }
  return null;
}
