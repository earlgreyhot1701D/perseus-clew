/**
 * Perseus Clew: Agent Integration API check module.
 *
 * Checks whether the spec supports agent integration: standard auth,
 * absence of universal-search hallucination traps, external documentation,
 * and SDK/Skill references.
 *
 * Weight: 10 (from SCORING.md v1.1.1)
 * Scored sub-checks: 4
 * Informational sub-check: 1 (SDK/Skill references)
 *
 * Amendment A5: universal search detection is SCORED. The search-product
 * exception uses two structural prongs (title + path-density). The
 * description-keyword prong was dropped to avoid false-negative risk
 * (a CRUD API mentioning "search service" in passing would get excused).
 *
 * Correction: API-AI-003 is COUNT-AWARE (a spec can have POST /search AND
 * POST /query, both qualifying). Full both-count grammar treatment.
 *
 * Schema traversal: sub-check 3 does a ONE-LEVEL read of request body
 * schema properties to determine "generic body." No deep traversal, no
 * walk-schema import. Wrapped to degrade gracefully on circular/weird
 * schemas (no throw, just "not flagged" = benefit of the doubt).
 *
 * Pitfall #2: not strongly applicable (securitySchemes is a flat registry,
 * universal-search checks per-path). No registry-key dedup needed.
 *
 * Swagger 2.0: securityDefinitions -> components.securitySchemes via
 * parse-spec.js conversion. externalDocs carried over. Request bodies
 * checked via both 3.x requestBody and 2.0 in:body parameter fallback.
 *
 * See BACKEND-API-CHECKS.md Module 6, Block 1G proposal.
 */

import { AppError } from '../../shared/errors.js';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

/**
 * Path patterns that indicate a universal search endpoint.
 */
const SEARCH_PATH_PATTERN = /\/(search|query)$/i;

/**
 * Generic body property names that suggest a free-form search query.
 */
const GENERIC_QUERY_PROPS = new Set([
  'query', 'q', 'filter', 'filters', 'search', 'expression', 'term', 'terms'
]);

/**
 * Run the Agent Integration check against a parsed OpenAPI spec.
 *
 * @param {{ spec: object, metadata: object }} parsedSpec - Output of parseSpec()
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkAgentIntegration(parsedSpec) {
  try {
    const { spec } = parsedSpec;
    let passed = 0;
    let total = 0;
    const findings = [];

    const paths = spec.paths || {};
    const operations = extractOperations(paths);

    // Zero-instance: no operations at all
    if (operations.length === 0) {
      return { passed: 1, total: 1, findings: [] };
    }

    // Sub-check 1 (API-AI-001): securitySchemes defined
    // Applicable: always when operations exist
    const sc1 = checkSecuritySchemesDefined(spec);
    total++;
    if (sc1) {
      findings.push(sc1);
    } else {
      passed++;
    }

    // Sub-check 2 (API-AI-002): Auth scheme clarity (apiKey schemes)
    // Applicable: only when apiKey-type schemes exist
    const securitySchemes = spec.components?.securitySchemes || {};
    const apiKeySchemes = Object.entries(securitySchemes).filter(
      ([, scheme]) => scheme && scheme.type === 'apiKey'
    );
    if (apiKeySchemes.length > 0) {
      const sc2 = checkAuthClarity(apiKeySchemes);
      total++;
      if (sc2) {
        findings.push(sc2);
      } else {
        passed++;
      }
    }

    // Sub-check 3 (API-AI-003): Universal search detection (A5, SCORED)
    // Applicable: only when POST operations exist
    const postOps = operations.filter(op => op.method === 'post');
    if (postOps.length > 0) {
      const sc3 = checkUniversalSearch(postOps, paths, spec);
      total++;
      if (sc3) {
        findings.push(sc3);
      } else {
        passed++;
      }
    }

    // Sub-check 4 (API-AI-004): externalDocs presence
    // Applicable: always when operations exist
    const sc4 = checkExternalDocs(spec);
    total++;
    if (sc4) {
      findings.push(sc4);
    } else {
      passed++;
    }

    // Sub-check 5: SDK/Skill references (INFORMATIONAL)
    // Does NOT increment total. Positive signal only, no finding for absence.
    // (Intentionally no-op for scoring. Future: surface as positive signal.)

    return { passed, total, findings };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'CHECK_MODULE_ERROR',
      'The agent integration check module encountered an internal error.',
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
 * Sub-check 1 (API-AI-001): securitySchemes defined.
 * Fixed-singular (one spec-global verdict). count is null.
 */
function checkSecuritySchemesDefined(spec) {
  const schemes = spec.components?.securitySchemes;
  if (schemes && typeof schemes === 'object' && Object.keys(schemes).length > 0) {
    return null;
  }

  return {
    id: 'API-AI-001',
    text: 'The spec does not define any security schemes. An agent attempting to authenticate cannot determine what credentials are required or how to provide them.',
    count: null
  };
}

/**
 * Sub-check 2 (API-AI-002): API key schemes specify `in` and `name`.
 * Count-aware (one or many apiKey schemes lacking clarity).
 */
function checkAuthClarity(apiKeySchemes) {
  const unclear = [];

  for (const [schemeName, scheme] of apiKeySchemes) {
    const hasIn = scheme.in && ['header', 'query', 'cookie'].includes(scheme.in);
    const hasName = scheme.name && scheme.name.trim().length > 0;
    if (!hasIn || !hasName) {
      unclear.push(schemeName);
    }
  }

  if (unclear.length === 0) return null;

  const examples = unclear.slice(0, 3);
  const noun = unclear.length === 1 ? 'API key security scheme does' : 'API key security schemes do';
  const ref = unclear.length === 1 ? 'this scheme' : 'these schemes';
  return {
    id: 'API-AI-002',
    text: `${unclear.length} ${noun} not specify where the key should be sent. An agent attempting to authenticate via ${ref} cannot determine the correct location without trial and error.`,
    count: unclear.length,
    examples
  };
}

/**
 * Sub-check 3 (API-AI-003): Universal search detection.
 * Count-aware (a spec can have multiple qualifying endpoints).
 *
 * Triple gate: POST + search-path + generic body.
 * Search-product exception: title contains "search" as primary noun,
 * OR >50% of paths contain /search or /query segments.
 * (Description prong dropped to avoid false-negative risk.)
 */
function checkUniversalSearch(postOps, paths, spec) {
  // Check search-product exception FIRST
  if (isSearchProduct(spec, paths)) return null;

  const flagged = [];

  for (const { path, operation } of postOps) {
    // Gate 1: path matches search/query pattern
    if (!SEARCH_PATH_PATTERN.test(path)) continue;

    // Gate 2: request body is generic
    if (!hasGenericRequestBody(operation)) continue;

    // All gates passed: this is a universal search endpoint
    flagged.push(`POST ${path}`);
  }

  if (flagged.length === 0) return null;

  const examples = flagged.slice(0, 3);
  const noun = flagged.length === 1 ? 'endpoint accepts' : 'endpoints accept';
  const ref = flagged.length === 1 ? 'this endpoint' : 'these endpoints';
  return {
    id: 'API-AI-003',
    text: `${flagged.length} universal search ${noun} a generic query body. An agent calling ${ref} without specific knowledge of valid query shapes faces ambiguity in parameter construction.`,
    count: flagged.length,
    examples
  };
}

/**
 * Detect if the API is a search product (exception to universal-search finding).
 *
 * Two structural prongs (description prong dropped):
 * 1. info.title contains "search" as a word boundary match
 * 2. >50% of paths contain /search or /query segments
 */
function isSearchProduct(spec, paths) {
  // Prong 1: title contains "search" as a primary noun
  const title = (spec.info?.title || '').toLowerCase();
  if (/\bsearch\b/.test(title)) return true;

  // Prong 2: >50% of paths contain /search or /query
  const pathKeys = Object.keys(paths);
  if (pathKeys.length === 0) return false;
  const searchPaths = pathKeys.filter(p => /\/(search|query)/i.test(p));
  if (searchPaths.length / pathKeys.length > 0.5) return true;

  return false;
}

/**
 * Determine if an operation has a generic/free-form request body.
 * One-level read only. Degrades to "not generic" (benefit of the doubt)
 * on weird/circular schemas.
 *
 * Generic means: no properties, OR only generic-named properties
 * (query/q/filter) typed as string/object with no constraints.
 */
function hasGenericRequestBody(operation) {
  try {
    const schema = extractRequestBodySchema(operation);
    if (!schema) return false; // No body schema = not flagged (benefit of doubt)

    // Empty schema or additionalProperties:true with no properties = generic
    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      return true;
    }

    const propEntries = Object.entries(schema.properties);

    // If ALL properties are generic-named and loosely typed, it's generic
    const allGeneric = propEntries.every(([name, propSchema]) => {
      const isGenericName = GENERIC_QUERY_PROPS.has(name.toLowerCase());
      const isLooseType = !propSchema || !propSchema.type ||
        propSchema.type === 'string' || propSchema.type === 'object';
      return isGenericName && isLooseType;
    });

    if (allGeneric && propEntries.length <= 3) return true;

    // Has required properties with specific types = not generic
    if (Array.isArray(schema.required) && schema.required.length > 0) {
      const hasSpecificRequired = schema.required.some(reqName => {
        return !GENERIC_QUERY_PROPS.has(reqName.toLowerCase());
      });
      if (hasSpecificRequired) return false;
    }

    return false;
  } catch {
    // Degrade gracefully on weird schemas: not flagged
    return false;
  }
}

/**
 * Extract request body schema from an operation.
 * Handles 3.x requestBody and 2.0 in:body parameter fallback.
 */
function extractRequestBodySchema(operation) {
  // OpenAPI 3.x: requestBody.content.application/json.schema
  if (operation.requestBody?.content) {
    const jsonContent = operation.requestBody.content['application/json']
      || Object.values(operation.requestBody.content)[0];
    if (jsonContent?.schema) return jsonContent.schema;
  }

  // Swagger 2.0 fallback: parameters with in:'body'
  if (Array.isArray(operation.parameters)) {
    const bodyParam = operation.parameters.find(p => p && p.in === 'body');
    if (bodyParam?.schema) return bodyParam.schema;
  }

  return null;
}

/**
 * Sub-check 4 (API-AI-004): externalDocs presence.
 * Fixed-singular (one spec-global verdict). count is null.
 */
function checkExternalDocs(spec) {
  const docs = spec.externalDocs;
  if (docs && docs.url && docs.url.trim().length > 0) {
    return null;
  }

  return {
    id: 'API-AI-004',
    text: 'The spec does not link to external documentation. An agent encountering ambiguity has no reference to consult beyond the spec itself.',
    count: null
  };
}
