/**
 * Perseus Clew: Discoverability API check module.
 *
 * Checks whether an agent can discover resources without guessing IDs.
 * If an API has GET /users/{userId} but no GET /users, an agent has no
 * starting point to find valid user IDs.
 *
 * Weight: 20 (from SCORING.md v1.1.1)
 * Sub-checks: 5 (sub-check 5 is informational, zero deduction)
 *
 * Pitfall #2 defense: findings deduped by RESOURCE, not per-operation.
 * If /{resource}/{id} has GET/PUT/DELETE all missing a sibling list,
 * that is ONE finding for the resource, not three.
 *
 * Action/RPC endpoints and singletons are excluded from list-endpoint
 * checks to avoid false-flagging legitimate API design patterns.
 *
 * Cycle-safety note: this module reads paths/parameters (flat structures).
 * No deep schema traversal needed. walk-schema.js is not imported.
 *
 * Swagger 2.0 (L-PS-3): query parameters may appear in the operation's
 * `parameters` array with `in: 'query'` in both 2.0 and 3.x. Handled
 * uniformly. No content/schema traversal needed for params.
 *
 * See BACKEND-API-CHECKS.md Module 3, Block 1G proposal.
 */

import { AppError } from '../../shared/errors.js';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

/**
 * Verbs that indicate an action/RPC endpoint, NOT a resource collection.
 * If the last path segment or the operationId contains one of these,
 * the endpoint is excluded from list-endpoint checks.
 */
const ACTION_VERBS = new Set([
  'send', 'trigger', 'cancel', 'approve', 'invoke', 'execute',
  'notify', 'subscribe', 'publish', 'retry', 'confirm', 'reject',
  'activate', 'deactivate', 'archive', 'unarchive', 'sync',
  'refresh', 'reset', 'revoke', 'verify', 'validate', 'export',
  'import', 'generate', 'process', 'submit', 'complete'
]);

/**
 * Singleton path segments that are NOT collections and should not be
 * flagged for missing list endpoints.
 */
const SINGLETON_SEGMENTS = new Set([
  'config', 'settings', 'me', 'account', 'health', 'status',
  'profile', 'current', 'self', 'info', 'metadata', 'whoami'
]);

/**
 * Common pagination parameter names (used to distinguish pagination
 * from filter params in sub-check 4).
 */
const PAGINATION_PARAMS = new Set([
  'limit', 'offset', 'page', 'pagesize', 'page_size', 'per_page',
  'perpage', 'cursor', 'after', 'before', 'skip', 'take'
]);

/**
 * Run the Discoverability check against a parsed OpenAPI spec.
 *
 * @param {{ spec: object, metadata: object }} parsedSpec - Output of parseSpec()
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkDiscoverability(parsedSpec) {
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

    const operations = extractOperations(paths);
    const itemResources = extractItemResources(pathKeys, paths, operations);
    const listEndpoints = extractListEndpoints(pathKeys, paths);

    // Sub-check 1: List endpoint presence (API-DISC-001)
    // Applicable: only when parameterized /{id} resource paths exist
    if (itemResources.length > 0) {
      const sc1 = checkListEndpointPresence(itemResources, listEndpoints);
      total++;
      if (sc1) {
        findings.push(sc1);
      } else {
        passed++;
      }
    }

    // Sub-check 2: Nested resource listability (API-DISC-002)
    // Applicable: only when multi-level nested item paths exist
    const nestedResources = itemResources.filter(r => r.depth >= 2);
    if (nestedResources.length > 0) {
      const sc2 = checkNestedListability(nestedResources, listEndpoints);
      total++;
      if (sc2) {
        findings.push(sc2);
      } else {
        passed++;
      }
    }

    // Sub-check 3: Filter documentation (API-DISC-003)
    // Applicable: only when list endpoints exist
    if (listEndpoints.length > 0) {
      const sc3 = checkFilterDocumentation(listEndpoints, paths);
      total++;
      if (sc3) {
        findings.push(sc3);
      } else {
        passed++;
      }
    }

    // Sub-check 4: Enum values on filters (API-DISC-004)
    // Applicable: only when list endpoints have non-pagination query params
    const listParamData = collectListQueryParams(listEndpoints, paths);
    if (listParamData.length > 0) {
      const sc4 = checkEnumValues(listParamData);
      total++;
      if (sc4) {
        findings.push(sc4);
      } else {
        passed++;
      }
    }

    // Sub-check 5: Outcome-focused operations (INFORMATIONAL)
    // Never adds to total/passed. Positive signal only, no finding for absence.
    // (Intentionally no-op: we do not generate findings for absence of
    // convenience endpoints. This sub-check exists in the spec as a future
    // informational signal surface; at build time it produces no output.)

    return { passed, total, findings };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'CHECK_MODULE_ERROR',
      'The discoverability check module encountered an internal error.',
      { originalError: error.message }
    );
  }
}

/**
 * Extract all operations from paths as flat array.
 */
function extractOperations(paths) {
  const ops = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) {
        ops.push({ method, path, operation: pathItem[method] });
      }
    }
  }
  return ops;
}

/**
 * Extract resources that have item-level (parameterized) paths.
 * Deduplicates by resource base path (Pitfall #2: one finding per resource).
 *
 * Detection rule for exclusions:
 * - ACTION exclusion: if the last path segment (before or after the param)
 *   is a known action verb, or the operationId/summary contains one.
 * - SINGLETON exclusion: if the resource segment is a known singleton.
 *
 * Returns array of { resource, itemPath, depth } where:
 * - resource: the collection base path (e.g., "/users")
 * - itemPath: one example item path (e.g., "/users/{userId}")
 * - depth: nesting depth (1 = top-level, 2+ = nested)
 */
function extractItemResources(pathKeys, paths, operations) {
  const resourceMap = new Map();

  for (const pathKey of pathKeys) {
    // Match paths with a parameter segment: /{resource}/{param}
    const segments = pathKey.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    // Find parameter segments
    const paramIndices = [];
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].startsWith('{') && segments[i].endsWith('}')) {
        paramIndices.push(i);
      }
    }

    if (paramIndices.length === 0) continue;

    // The last param index determines the item-path pattern
    const lastParamIdx = paramIndices[paramIndices.length - 1];

    // Resource segment is the one before the last param
    if (lastParamIdx === 0) continue; // No resource segment before param
    const resourceSegment = segments[lastParamIdx - 1];

    // Singleton exclusion
    if (SINGLETON_SEGMENTS.has(resourceSegment.toLowerCase())) continue;

    // Action exclusion: check segments AFTER the last param
    const trailingSegments = segments.slice(lastParamIdx + 1);
    if (trailingSegments.length > 0) {
      // This is a sub-resource or action path like /orders/{id}/cancel
      const lastSegment = trailingSegments[trailingSegments.length - 1];
      if (isActionSegment(lastSegment)) continue;
      // If trailing segment is parameterized, it's nested resource, handled below
    }

    // Check operationId/summary for action verbs
    const pathOps = getPathOperations(pathKey, paths);
    if (pathOps.length > 0 && pathOps.every(op => isActionOperation(op))) continue;

    // Build the collection path: everything up to (but not including) the last param
    // For /users/{userId} -> /users
    // For /courses/{courseId}/students/{studentId} -> /courses/{courseId}/students
    const collectionSegments = segments.slice(0, lastParamIdx);
    const normalizedCollection = '/' + collectionSegments.join('/');

    // Nesting depth = number of param segments
    const depth = paramIndices.length;

    // Dedup by collection path (Pitfall #2: one per resource)
    if (!resourceMap.has(normalizedCollection)) {
      resourceMap.set(normalizedCollection, {
        resource: normalizedCollection,
        itemPath: pathKey,
        depth
      });
    }
  }

  return [...resourceMap.values()];
}

/**
 * Check if a path segment looks like an action verb.
 */
function isActionSegment(segment) {
  const lower = segment.toLowerCase().replace(/[^a-z]/g, '');
  return ACTION_VERBS.has(lower);
}

/**
 * Check if an operation looks action-oriented (via operationId or summary).
 */
function isActionOperation(op) {
  const opId = (op.operationId || '').toLowerCase();
  const summary = (op.summary || '').toLowerCase();
  const combined = opId + ' ' + summary;

  for (const verb of ACTION_VERBS) {
    if (combined.includes(verb)) return true;
  }
  return false;
}

/**
 * Get all operations for a specific path.
 */
function getPathOperations(pathKey, paths) {
  const pathItem = paths[pathKey];
  if (!pathItem || typeof pathItem !== 'object') return [];
  const ops = [];
  for (const method of HTTP_METHODS) {
    if (pathItem[method]) ops.push(pathItem[method]);
  }
  return ops;
}

/**
 * Extract list endpoints (GET on collection paths without trailing {param}).
 * Returns array of { path, operation }.
 */
function extractListEndpoints(pathKeys, paths) {
  const results = [];
  for (const pathKey of pathKeys) {
    const segments = pathKey.split('/').filter(Boolean);
    // A list endpoint ends with a non-param segment
    if (segments.length === 0) continue;
    const lastSegment = segments[segments.length - 1];
    if (lastSegment.startsWith('{')) continue; // Item path, not list

    const pathItem = paths[pathKey];
    if (!pathItem || typeof pathItem !== 'object') continue;
    if (pathItem.get) {
      results.push({ path: pathKey, operation: pathItem.get });
    }
  }
  return results;
}

/**
 * Sub-check 1: For every item resource, a list endpoint exists.
 * Deduped by resource (Pitfall #2).
 */
function checkListEndpointPresence(itemResources, listEndpoints) {
  const listPaths = new Set(listEndpoints.map(e => e.path.toLowerCase()));

  const missing = [];
  for (const { resource, itemPath } of itemResources) {
    // The expected list path is the resource collection path
    if (!listPaths.has(resource.toLowerCase())) {
      missing.push(resource);
    }
  }

  if (missing.length === 0) return null;

  const examples = missing.slice(0, 3);
  const noun = missing.length === 1 ? 'resource has' : 'resources have';
  const ref = missing.length === 1 ? 'this resource' : 'these resources';
  return {
    id: 'API-DISC-001',
    text: `${missing.length} ${noun} item endpoints but no list endpoint. An agent cannot discover ${ref} without an externally provided identifier.`,
    count: missing.length,
    examples
  };
}

/**
 * Sub-check 2: Nested resources have independently listable parents.
 */
function checkNestedListability(nestedResources, listEndpoints) {
  const listPaths = new Set(listEndpoints.map(e => e.path.toLowerCase()));

  const missing = [];
  for (const { resource, itemPath } of nestedResources) {
    // Check that intermediate collection paths exist
    const segments = resource.split('/').filter(Boolean);
    // Walk up the path looking for parent collections
    for (let i = 0; i < segments.length - 1; i++) {
      if (segments[i].startsWith('{')) continue;
      const parentCollection = '/' + segments.slice(0, i + 1).join('/');
      // Only check if this segment looks like a resource (next is a param)
      const nextSeg = segments[i + 1];
      if (nextSeg && nextSeg.startsWith('{')) {
        // This is a parent resource, check it has a list
        if (!listPaths.has(parentCollection.toLowerCase())) {
          if (!missing.includes(parentCollection)) {
            missing.push(parentCollection);
          }
        }
      }
    }
  }

  if (missing.length === 0) return null;

  const examples = missing.slice(0, 3);
  const noun = missing.length === 1 ? 'parent collection is' : 'parent collections are';
  const ref = missing.length === 1 ? 'that collection' : 'those collections';
  return {
    id: 'API-DISC-002',
    text: `${missing.length} nested ${noun} not independently listable. An agent navigating to ${ref} cannot enumerate available items without traversing the full hierarchy.`,
    count: missing.length,
    examples
  };
}

/**
 * Sub-check 3: List endpoints document query parameters.
 */
function checkFilterDocumentation(listEndpoints, paths) {
  const undocumented = [];

  for (const { path, operation } of listEndpoints) {
    const params = getQueryParams(operation, paths[path]);
    // A list endpoint with zero query params documented
    if (params.length === 0) {
      undocumented.push(path);
    }
  }

  if (undocumented.length === 0) return null;

  const examples = undocumented.slice(0, 3);
  const noun = undocumented.length === 1 ? 'list endpoint documents' : 'list endpoints document';
  const ref = undocumented.length === 1 ? 'this endpoint' : 'these endpoints';
  return {
    id: 'API-DISC-003',
    text: `${undocumented.length} ${noun} no query parameters. An agent calling ${ref} cannot filter or paginate results.`,
    count: undocumented.length,
    examples
  };
}

/**
 * Collect non-pagination query params from list endpoints for sub-check 4.
 * Returns array of { path, paramName, param } for params that could benefit from enums.
 */
function collectListQueryParams(listEndpoints, paths) {
  const results = [];

  for (const { path, operation } of listEndpoints) {
    const params = getQueryParams(operation, paths[path]);
    for (const param of params) {
      const name = (param.name || '').toLowerCase();
      if (PAGINATION_PARAMS.has(name)) continue;

      // Only string-typed params are candidates for enums
      const schema = param.schema || param;
      const type = schema.type || '';
      if (type === 'string' || type === '') {
        results.push({ path, paramName: param.name, param });
      }
    }
  }
  return results;
}

/**
 * Sub-check 4: String query params on list endpoints have enum values.
 */
function checkEnumValues(listParamData) {
  const missingEnum = [];

  for (const { path, paramName, param } of listParamData) {
    const schema = param.schema || param;
    if (!schema.enum || !Array.isArray(schema.enum) || schema.enum.length === 0) {
      missingEnum.push(`${path} ?${paramName}`);
    }
  }

  if (missingEnum.length === 0) return null;

  const examples = missingEnum.slice(0, 3);
  const noun = missingEnum.length === 1 ? 'filter parameter has' : 'filter parameters have';
  const ref = missingEnum.length === 1 ? 'this parameter' : 'these parameters';
  return {
    id: 'API-DISC-004',
    text: `${missingEnum.length} ${noun} no documented enum values. An agent using ${ref} has to guess valid options.`,
    count: missingEnum.length,
    examples
  };
}

/**
 * Get query parameters from an operation (handles both 3.x and 2.0 shapes).
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

  // Operation-level parameters (override path-level by name)
  if (Array.isArray(operation?.parameters)) {
    for (const p of operation.parameters) {
      if (p && p.in === 'query') {
        // Dedup: operation-level wins
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
