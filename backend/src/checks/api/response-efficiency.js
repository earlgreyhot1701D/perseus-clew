/**
 * Perseus Clew: Response Efficiency API check module.
 *
 * Checks whether response schemas are focused and whether list endpoints
 * support pagination and filtering. Verbose or deeply nested responses
 * force agents to traverse many levels to reach useful data, burning
 * context tokens on structure rather than content.
 *
 * Weight: 15 (from SCORING.md v1.1.1)
 * Sub-checks: 4 (Amendment A1 removed raw schema-property-count check)
 *
 * Schema traversal (L-ALLOF-DEPTH):
 * - Sub-check 1 (nesting depth) traverses response schemas using walk-schema.js
 *   which handles allOf/oneOf/anyOf composition and is cycle-safe via WeakSet.
 * - Sub-checks 2/3/4 read path/operation parameters (flat); no schema traversal.
 *
 * Pitfall #2: response schemas shared across endpoints (registry members)
 * are scored ONCE via components.schemas membership.
 *
 * Depth measurement rule (through composition):
 * - allOf/oneOf/anyOf members do NOT add a depth level themselves (they are
 *   structural combinators, not data nesting). Their CONTENTS inherit the
 *   parent depth.
 * - schema.properties children add +1 depth (object nesting).
 * - schema.items adds +1 depth (array nesting).
 * - schema.additionalProperties adds +1 depth.
 * This is exactly what walk-schema.js implements (composition at same depth,
 * properties/items/additionalProperties at depth+1).
 *
 * Nesting depth threshold: 3 levels.
 * Rationale: at depth 3, an agent must parse response.data.items[].nested.field
 * which requires 3 traversal steps beyond the root. This is the point where
 * structured extraction becomes unreliable for agents that consume JSON via
 * tool-calling (observed in production agent behavior). Documented for
 * SCORING.md traceability.
 *
 * List endpoint detection (the distinctive risk):
 * A GET endpoint is a "list endpoint" if its success response schema has
 * type: 'array', OR wraps an array property (type: 'object' with a property
 * whose type is 'array' that looks like a collection). Conservative rule:
 * only flag endpoints where the schema IS an array or has a top-level items/
 * data/results array property. A GET returning a single object is NEVER
 * flagged for missing pagination.
 *
 * Swagger 2.0 (L-PS-3): success response schemas detected via both 3.x
 * content structure and 2.0 schema-on-response. Parameters handled uniformly.
 *
 * See BACKEND-API-CHECKS.md Module 4, Block 1G proposal.
 */

import { AppError } from '../../shared/errors.js';
import { measureNestingDepth, getRegistryKeyName } from './walk-schema.js';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

/**
 * Nesting depth threshold.
 *
 * Rationale: at 3+ levels of object nesting, an agent must traverse
 * response.level1.level2.level3 to reach leaf data. Production agents
 * consuming JSON via tool-calling have been observed to fail or hallucinate
 * paths beyond this depth. Value documented for SCORING.md traceability.
 */
const DEPTH_THRESHOLD = 3;

/**
 * Common pagination parameter names.
 */
const PAGINATION_PARAMS = new Set([
  'limit', 'offset', 'page', 'pagesize', 'page_size', 'per_page',
  'perpage', 'cursor', 'after', 'before', 'skip', 'take'
]);

/**
 * Common array-wrapper property names that indicate a collection response.
 */
const COLLECTION_ARRAY_PROPS = new Set([
  'items', 'data', 'results', 'records', 'entries', 'list',
  'rows', 'elements', 'content', 'nodes', 'edges', 'values'
]);

/**
 * Common total-count property names.
 */
const TOTAL_COUNT_PROPS = new Set([
  'totalcount', 'total_count', 'total', 'count', 'totalitems',
  'total_items', 'totalresults', 'total_results', 'size', 'length'
]);

/**
 * Run the Response Efficiency check against a parsed OpenAPI spec.
 *
 * @param {{ spec: object, metadata: object }} parsedSpec - Output of parseSpec()
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkResponseEfficiency(parsedSpec) {
  try {
    const { spec } = parsedSpec;
    let passed = 0;
    let total = 0;
    const findings = [];

    const paths = spec.paths || {};
    const pathKeys = Object.keys(paths);

    // Zero-instance: no paths at all
    if (pathKeys.length === 0) {
      return { passed: 1, total: 1, findings: [] };
    }

    // Collect response schemas for sub-check 1
    const responseSchemas = collectResponseSchemas(paths, spec);
    // Collect list endpoints for sub-checks 2/3/4
    const listEndpoints = collectListEndpoints(paths);

    // If neither response schemas nor list endpoints exist, zero-instance
    if (responseSchemas.length === 0 && listEndpoints.length === 0) {
      return { passed: 1, total: 1, findings: [] };
    }

    // Sub-check 1: Nesting depth (API-RE-001)
    // Applicable: when response schemas exist
    // Uses walk-schema.js measureNestingDepth (cycle-safe, allOf-aware)
    if (responseSchemas.length > 0) {
      const sc1 = checkNestingDepth(responseSchemas);
      total++;
      if (sc1) {
        findings.push(sc1);
      } else {
        passed++;
      }
    }

    // Sub-check 2: Pagination support (API-RE-002)
    // Applicable: when list endpoints exist
    if (listEndpoints.length > 0) {
      const sc2 = checkPaginationSupport(listEndpoints, paths);
      total++;
      if (sc2) {
        findings.push(sc2);
      } else {
        passed++;
      }
    }

    // Sub-check 3: Total count presence (API-RE-003)
    // Applicable: when list endpoints exist
    if (listEndpoints.length > 0) {
      const sc3 = checkTotalCount(listEndpoints, paths, spec);
      total++;
      if (sc3) {
        findings.push(sc3);
      } else {
        passed++;
      }
    }

    // Sub-check 4: Filter params on lists (API-RE-004)
    // Applicable: when list endpoints exist
    if (listEndpoints.length > 0) {
      const sc4 = checkFilterParams(listEndpoints, paths);
      total++;
      if (sc4) {
        findings.push(sc4);
      } else {
        passed++;
      }
    }

    return { passed, total, findings };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'CHECK_MODULE_ERROR',
      'The response efficiency check module encountered an internal error.',
      { originalError: error.message }
    );
  }
}

/**
 * Collect response schemas from all operations.
 * Pitfall #2: registry-key members scored once via dedup.
 * Returns array of { path, method, schema, label }.
 */
function collectResponseSchemas(paths, spec) {
  const results = [];
  const seenRegistryKeys = new Set();

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const responses = operation.responses;
      if (!responses || typeof responses !== 'object') continue;

      for (const [code, response] of Object.entries(responses)) {
        const codeStr = String(code);
        // Only check success responses (2xx)
        if (!codeStr.startsWith('2')) continue;

        const schema = extractResponseSchema(response);
        if (!schema) continue;

        // Pitfall #2: registry-key dedup
        const registryKey = getRegistryKeyName(spec, schema);
        if (registryKey) {
          if (seenRegistryKeys.has(registryKey)) continue;
          seenRegistryKeys.add(registryKey);
        }

        const label = registryKey || `${method.toUpperCase()} ${path}`;
        results.push({ path, method, schema, label });
      }
    }
  }
  return results;
}

/**
 * Extract schema from a response object (handles 3.x and 2.0).
 */
function extractResponseSchema(response) {
  if (!response || typeof response !== 'object') return null;

  // OpenAPI 3.x: content -> media type -> schema
  if (response.content) {
    const jsonContent = response.content['application/json']
      || Object.values(response.content)[0];
    if (jsonContent && jsonContent.schema) {
      return jsonContent.schema;
    }
  }

  // Swagger 2.0 converted: schema directly on response
  if (response.schema && typeof response.schema === 'object') {
    return response.schema;
  }

  return null;
}

/**
 * Collect list endpoints: GET operations whose success response is an array
 * or wraps a collection array property.
 *
 * Detection rule (the distinctive risk):
 * - Schema type === 'array' -> direct array response, IS a list
 * - Schema is an object with a top-level property in COLLECTION_ARRAY_PROPS
 *   that has type 'array' -> wrapped collection, IS a list
 * - Everything else -> NOT a list (single object GET, never flagged for pagination)
 */
function collectListEndpoints(paths) {
  const results = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const operation = pathItem.get;
    if (!operation) continue;

    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') continue;

    // Check success responses for array shape
    for (const [code, response] of Object.entries(responses)) {
      const codeStr = String(code);
      if (!codeStr.startsWith('2')) continue;

      const schema = extractResponseSchema(response);
      if (!schema) continue;

      if (isListSchema(schema)) {
        results.push({ path, operation });
        break; // One match per path is enough
      }
    }
  }
  return results;
}

/**
 * Determine if a schema represents a list/collection response.
 * Conservative: only type:'array' or object with known collection array prop.
 */
function isListSchema(schema) {
  if (!schema || typeof schema !== 'object') return false;

  // Direct array
  if (schema.type === 'array') return true;

  // Object with a collection-array property
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if (COLLECTION_ARRAY_PROPS.has(propName.toLowerCase())) {
        if (propSchema && propSchema.type === 'array') return true;
      }
    }
  }

  return false;
}

/**
 * Sub-check 1: Response schema nesting depth.
 * Uses walk-schema.js measureNestingDepth which is cycle-safe and
 * handles allOf/oneOf/anyOf at same depth level.
 *
 * Circular schemas: measureNestingDepth stops at cycles (WeakSet guard),
 * returning the max depth reached before the cycle. This means a
 * TreeNode -> children -> TreeNode schema returns a bounded depth,
 * not infinity. The depth measurement is correct: cycles represent
 * recursive structure, and the first encounter measures the actual
 * nesting the agent would traverse before hitting a repeated shape.
 */
function checkNestingDepth(responseSchemas) {
  const tooDeep = [];

  for (const { label, schema } of responseSchemas) {
    const depth = measureNestingDepth(schema);
    if (depth >= DEPTH_THRESHOLD) {
      tooDeep.push(`${label} (depth ${depth})`);
    }
  }

  if (tooDeep.length === 0) return null;

  const examples = tooDeep.slice(0, 3);
  const noun = tooDeep.length === 1 ? 'response schema has' : 'response schemas have';
  const ref = tooDeep.length === 1 ? 'this response' : 'these responses';
  return {
    id: 'API-RE-001',
    text: `${tooDeep.length} ${noun} nesting ${DEPTH_THRESHOLD} or more levels deep. An agent parsing ${ref} has to traverse multiple object levels to reach leaf data.`,
    count: tooDeep.length,
    examples
  };
}

/**
 * Sub-check 2: List endpoints document pagination parameters.
 */
function checkPaginationSupport(listEndpoints, paths) {
  const noPagination = [];

  for (const { path, operation } of listEndpoints) {
    const params = getQueryParams(operation, paths[path]);
    const hasPagination = params.some(p =>
      PAGINATION_PARAMS.has((p.name || '').toLowerCase())
    );
    if (!hasPagination) {
      noPagination.push(path);
    }
  }

  if (noPagination.length === 0) return null;

  const examples = noPagination.slice(0, 3);
  const noun = noPagination.length === 1 ? 'list endpoint does' : 'list endpoints do';
  const ref = noPagination.length === 1 ? 'this endpoint' : 'these endpoints';
  return {
    id: 'API-RE-002',
    text: `${noPagination.length} ${noun} not document pagination parameters. An agent calling ${ref} cannot control result set size.`,
    count: noPagination.length,
    examples
  };
}

/**
 * Sub-check 3: List endpoint responses include a total count property.
 */
function checkTotalCount(listEndpoints, paths, spec) {
  const noTotal = [];

  for (const { path, operation } of listEndpoints) {
    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') {
      noTotal.push(path);
      continue;
    }

    let hasTotalCount = false;
    for (const [code, response] of Object.entries(responses)) {
      if (!String(code).startsWith('2')) continue;
      const schema = extractResponseSchema(response);
      if (schema && hasTotalCountProperty(schema)) {
        hasTotalCount = true;
        break;
      }
    }

    if (!hasTotalCount) {
      noTotal.push(path);
    }
  }

  if (noTotal.length === 0) return null;

  const examples = noTotal.slice(0, 3);
  const noun = noTotal.length === 1 ? 'list endpoint does' : 'list endpoints do';
  const ref = noTotal.length === 1 ? 'this endpoint' : 'these endpoints';
  return {
    id: 'API-RE-003',
    text: `${noTotal.length} ${noun} not include a total count in the response. An agent paginating through ${ref} cannot determine how many results exist.`,
    count: noTotal.length,
    examples
  };
}

/**
 * Check if a response schema has a total-count property.
 */
function hasTotalCountProperty(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (!schema.properties) return false;

  for (const propName of Object.keys(schema.properties)) {
    if (TOTAL_COUNT_PROPS.has(propName.toLowerCase())) return true;
  }
  return false;
}

/**
 * Sub-check 4: List endpoints offer non-pagination filter params.
 */
function checkFilterParams(listEndpoints, paths) {
  const noFilters = [];

  for (const { path, operation } of listEndpoints) {
    const params = getQueryParams(operation, paths[path]);
    const hasFilter = params.some(p =>
      !PAGINATION_PARAMS.has((p.name || '').toLowerCase())
    );
    if (!hasFilter) {
      noFilters.push(path);
    }
  }

  if (noFilters.length === 0) return null;

  const examples = noFilters.slice(0, 3);
  const noun = noFilters.length === 1 ? 'list endpoint offers' : 'list endpoints offer';
  const ref = noFilters.length === 1 ? 'this endpoint' : 'these endpoints';
  return {
    id: 'API-RE-004',
    text: `${noFilters.length} ${noun} no filter parameters beyond pagination. An agent calling ${ref} has to retrieve entire result sets and filter client-side.`,
    count: noFilters.length,
    examples
  };
}

/**
 * Get query parameters from an operation (handles both 3.x and 2.0).
 * Merges path-level and operation-level parameters.
 */
function getQueryParams(operation, pathItem) {
  const params = [];

  // Path-level parameters
  if (Array.isArray(pathItem?.parameters)) {
    for (const p of pathItem.parameters) {
      if (p && p.in === 'query') params.push(p);
    }
  }

  // Operation-level parameters
  if (Array.isArray(operation?.parameters)) {
    for (const p of operation.parameters) {
      if (p && p.in === 'query') {
        const existing = params.findIndex(pp => pp.name === p.name);
        if (existing >= 0) {
          params[existing] = p;
        } else {
          params.push(p);
        }
      }
    }
  }

  return params;
}
