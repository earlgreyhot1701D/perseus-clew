/**
 * Perseus Clew: Error Design API check module.
 *
 * Checks whether error responses follow structured formats that enable
 * one-try recovery for agents. Agents encountering a 400 with no body
 * or an opaque "Bad Request" message enter retry loops because they
 * cannot identify which field or value caused the rejection.
 *
 * Weight: 20 (from SCORING.md v1.1.1)
 * Sub-checks: 5
 *
 * Pitfall #2 defense: shared error schemas (components.schemas registry-key
 * members) are scored once regardless of how many endpoints reference them.
 * 5xx responses are never flagged.
 *
 * Swagger 2.0 (L-PS-3): converted specs may lack 3.x response content/schema
 * shape. Sub-checks that inspect error bodies handle this gracefully (N/A when
 * no parseable schema exists, not a false flag).
 *
 * See BACKEND-API-CHECKS.md Module 2, Block 1G proposal.
 */

import { AppError } from '../../shared/errors.js';
import { walkSchema, getRegistryKeyName } from './walk-schema.js';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

/**
 * Response status codes considered 4xx for our checks.
 * We coerce all keys to strings before matching (L-PS-3 Swagger 2.0 safety).
 */
function is4xx(code) {
  const s = String(code);
  return s.length === 3 && s.startsWith('4');
}

/**
 * Run the Error Design check against a parsed OpenAPI spec.
 *
 * @param {{ spec: object, metadata: object }} parsedSpec - Output of parseSpec()
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkErrorDesign(parsedSpec) {
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

    // Sub-check 1: 4xx response documented (API-ED-001)
    // Applicable: always when operations exist
    const sc1 = checkFourXXDocumented(operations);
    total++;
    if (sc1) {
      findings.push(sc1);
    } else {
      passed++;
    }

    // Collect all documented 4xx responses with schemas for sub-checks 2-4
    const fourXXWithSchemas = collectFourXXSchemas(operations, spec);
    const fourXXResponses = collectFourXXResponses(operations);

    // Sub-check 2: Error schema present (API-ED-002)
    // Applicable: only when at least one 4xx response is documented
    if (fourXXResponses.length > 0) {
      const sc2 = checkErrorSchemaPresent(fourXXResponses);
      total++;
      if (sc2) {
        findings.push(sc2);
      } else {
        passed++;
      }
    }

    // Sub-check 3: Field-level error info (API-ED-003)
    // Applicable: only when at least one 4xx response has a schema
    if (fourXXWithSchemas.length > 0) {
      const sc3 = checkFieldLevelInfo(fourXXWithSchemas, spec);
      total++;
      if (sc3) {
        findings.push(sc3);
      } else {
        passed++;
      }
    }

    // Sub-check 4: Error structure consistency (API-ED-004)
    // Applicable: only when 2+ distinct 4xx schemas exist to compare
    if (fourXXWithSchemas.length >= 2) {
      const sc4 = checkErrorConsistency(fourXXWithSchemas, spec);
      total++;
      if (sc4) {
        findings.push(sc4);
      } else {
        passed++;
      }
    }

    // Sub-check 5: Common-error completeness (API-ED-005)
    // Applicable: always when operations exist
    const sc5 = checkCommonErrors(operations, spec);
    total++;
    if (sc5) {
      findings.push(sc5);
    } else {
      passed++;
    }

    return { passed, total, findings };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'CHECK_MODULE_ERROR',
      'The error design check module encountered an internal error.',
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
 * Sub-check 1: Every operation documents at least one 4xx response.
 */
function checkFourXXDocumented(operations) {
  const missing = [];
  for (const { method, path, operation } of operations) {
    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') {
      missing.push(`${method.toUpperCase()} ${path}`);
      continue;
    }

    const has4xx = Object.keys(responses).some(code => is4xx(code));
    if (!has4xx) {
      missing.push(`${method.toUpperCase()} ${path}`);
    }
  }

  if (missing.length === 0) return null;

  const examples = missing.slice(0, 3);
  const noun = missing.length === 1 ? 'operation documents' : 'operations document';
  const ref = missing.length === 1 ? 'this endpoint' : 'these endpoints';
  return {
    id: 'API-ED-001',
    text: `${missing.length} ${noun} no 4xx error responses. An agent encountering an error from ${ref} has no documented recovery path.`,
    count: missing.length,
    examples
  };
}

/**
 * Collect all documented 4xx responses (with or without schemas) for sub-check 2.
 * Returns array of { method, path, code, response }.
 */
function collectFourXXResponses(operations) {
  const results = [];
  for (const { method, path, operation } of operations) {
    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') continue;

    for (const [code, response] of Object.entries(responses)) {
      if (is4xx(code) && response && typeof response === 'object') {
        results.push({ method, path, code, response });
      }
    }
  }
  return results;
}

/**
 * Collect all 4xx responses that have a schema attached.
 * Returns array of { method, path, code, schema }.
 * Pitfall #2: uses getRegistryKeyName to deduplicate shared schemas.
 */
function collectFourXXSchemas(operations, spec) {
  const results = [];
  const seenRegistryKeys = new Set();

  for (const { method, path, operation } of operations) {
    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') continue;

    for (const [code, response] of Object.entries(responses)) {
      if (!is4xx(code) || !response || typeof response !== 'object') continue;

      const schema = extractResponseSchema(response);
      if (!schema) continue;

      // Pitfall #2: if this schema is a registry-key member, only include once
      const registryKey = getRegistryKeyName(spec, schema);
      if (registryKey) {
        if (seenRegistryKeys.has(registryKey)) continue;
        seenRegistryKeys.add(registryKey);
      }

      results.push({ method, path, code, schema, registryKey });
    }
  }
  return results;
}

/**
 * Extract the schema from a response object.
 * Handles OpenAPI 3.x (content.application/json.schema) and
 * Swagger 2.0 converted structure (schema directly on response).
 */
function extractResponseSchema(response) {
  // OpenAPI 3.x: content -> media type -> schema
  if (response.content) {
    const jsonContent = response.content['application/json']
      || response.content['application/problem+json']
      || Object.values(response.content)[0];
    if (jsonContent && jsonContent.schema) {
      return jsonContent.schema;
    }
  }

  // Swagger 2.0 converted: schema directly on response (L-PS-3)
  if (response.schema && typeof response.schema === 'object') {
    return response.schema;
  }

  return null;
}

/**
 * Sub-check 2: Documented 4xx responses have a schema (not just status + description).
 */
function checkErrorSchemaPresent(fourXXResponses) {
  const noSchema = [];
  for (const { method, path, code, response } of fourXXResponses) {
    const schema = extractResponseSchema(response);
    if (!schema) {
      noSchema.push(`${method.toUpperCase()} ${path} ${code}`);
    }
  }

  if (noSchema.length === 0) return null;

  const examples = noSchema.slice(0, 3);
  const noun = noSchema.length === 1 ? 'error response has' : 'error responses have';
  const ref = noSchema.length === 1 ? 'this response' : 'these responses';
  return {
    id: 'API-ED-002',
    text: `${noSchema.length} documented 4xx ${noun} no schema. An agent receiving ${ref} cannot parse the error structure to determine what went wrong.`,
    count: noSchema.length,
    examples
  };
}

/**
 * Sub-check 3: Error schemas contain field-level error info.
 * Looks for: field/fieldName property, errors/details array, or RFC 9457 structure.
 */
function checkFieldLevelInfo(fourXXWithSchemas, spec) {
  const lacking = [];

  for (const { method, path, code, schema, registryKey } of fourXXWithSchemas) {
    if (hasFieldIdentification(schema)) continue;
    const label = registryKey || `${method.toUpperCase()} ${path} ${code}`;
    lacking.push(label);
  }

  if (lacking.length === 0) return null;

  const examples = lacking.slice(0, 3);
  const noun = lacking.length === 1 ? 'error schema does' : 'error schemas do';
  const ref = lacking.length === 1 ? 'this error' : 'these errors';
  return {
    id: 'API-ED-003',
    text: `${lacking.length} ${noun} not identify which field caused the error. An agent receiving ${ref} cannot determine what to correct without inspecting the full request.`,
    count: lacking.length,
    examples
  };
}

/**
 * Check if a schema has field-level error identification.
 * Recognizes: RFC 9457 Problem Details, errors/details arrays, field/fieldName properties.
 */
function hasFieldIdentification(schema) {
  if (!schema || typeof schema !== 'object') return false;

  const props = schema.properties;
  if (!props || typeof props !== 'object') return false;

  const propNames = Object.keys(props).map(k => k.toLowerCase());

  // RFC 9457 Problem Details: type + title + status + detail
  const rfc9457Keys = ['type', 'title', 'status', 'detail'];
  const hasRfc9457 = rfc9457Keys.every(k => propNames.includes(k));
  if (hasRfc9457) return true;

  // errors or details array
  for (const key of propNames) {
    if (key === 'errors' || key === 'details' || key === 'violations') {
      const propSchema = props[Object.keys(props).find(k => k.toLowerCase() === key)];
      if (propSchema && (propSchema.type === 'array' || Array.isArray(propSchema.items))) {
        return true;
      }
    }
  }

  // field or fieldName property directly
  if (propNames.includes('field') || propNames.includes('fieldname') || propNames.includes('field_name')) {
    return true;
  }

  return false;
}

/**
 * Sub-check 4: Error structure consistency across the spec.
 * RFC 9457 = full pass. Same custom shape everywhere = pass. Mixed = finding.
 */
function checkErrorConsistency(fourXXWithSchemas, spec) {
  // Classify each schema shape
  const shapes = fourXXWithSchemas.map(entry => classifyErrorShape(entry.schema));

  const uniqueShapes = new Set(shapes);

  // All same shape = consistent, pass
  if (uniqueShapes.size <= 1) return null;

  // Mixed shapes = finding
  const shapeList = [...uniqueShapes].join(', ');
  return {
    id: 'API-ED-004',
    text: `Error response schemas use ${uniqueShapes.size} different structures (${shapeList}). An agent parsing errors from this API has to handle multiple formats rather than a single consistent shape.`,
    count: uniqueShapes.size,
    examples: [...uniqueShapes]
  };
}

/**
 * Classify an error schema into a shape category.
 */
function classifyErrorShape(schema) {
  if (!schema || typeof schema !== 'object' || !schema.properties) {
    return 'unstructured';
  }

  const propNames = Object.keys(schema.properties).map(k => k.toLowerCase());

  // RFC 9457 Problem Details
  const rfc9457Keys = ['type', 'title', 'status', 'detail'];
  if (rfc9457Keys.every(k => propNames.includes(k))) {
    return 'rfc9457';
  }

  // errors-array pattern
  if (propNames.includes('errors') || propNames.includes('details') || propNames.includes('violations')) {
    return 'errors-array';
  }

  // message + code pattern
  if (propNames.includes('message') && propNames.includes('code')) {
    return 'message-code';
  }

  // message-only pattern
  if (propNames.includes('message')) {
    return 'message-only';
  }

  return 'custom';
}

/**
 * Sub-check 5: Common-error completeness.
 * - Operations with security: should document 401
 * - Input-accepting operations (POST/PUT/PATCH with requestBody): should document 400 or 422
 * - Resource endpoints (GET/DELETE with path params): should document 404
 */
function checkCommonErrors(operations, spec) {
  const gaps = [];
  const globalSecurity = spec.security && spec.security.length > 0;

  for (const { method, path, operation } of operations) {
    const responses = operation.responses || {};
    const responseCodes = Object.keys(responses).map(String);

    // Auth-protected: should document 401
    const hasSecurity = operation.security !== undefined
      ? (Array.isArray(operation.security) && operation.security.length > 0)
      : globalSecurity;

    if (hasSecurity && !responseCodes.some(c => c === '401')) {
      gaps.push(`${method.toUpperCase()} ${path} (missing 401)`);
    }

    // Input-accepting: should document 400 or 422
    const isInputAccepting = ['post', 'put', 'patch'].includes(method)
      && (operation.requestBody || operation.parameters?.some(p => p.in === 'body'));

    if (isInputAccepting && !responseCodes.some(c => c === '400' || c === '422')) {
      gaps.push(`${method.toUpperCase()} ${path} (missing 400/422)`);
    }

    // Resource endpoint: should document 404
    const hasPathParams = path.includes('{');
    const isResourceGet = ['get', 'delete', 'put', 'patch'].includes(method) && hasPathParams;

    if (isResourceGet && !responseCodes.some(c => c === '404')) {
      gaps.push(`${method.toUpperCase()} ${path} (missing 404)`);
    }
  }

  if (gaps.length === 0) return null;

  const examples = gaps.slice(0, 3);
  const noun = gaps.length === 1 ? 'operation is' : 'operations are';
  const ref = gaps.length === 1 ? 'that endpoint' : 'those endpoints';
  return {
    id: 'API-ED-005',
    text: `${gaps.length} ${noun} missing expected error responses for the operation type. An agent encountering an undocumented error from ${ref} has no structured recovery path.`,
    count: gaps.length,
    examples
  };
}
