/**
 * Perseus Clew: OpenAPI/Swagger spec parser.
 *
 * Parses an OpenAPI 3.x or Swagger 2.0 spec, resolves $refs, and returns
 * a normalized OpenAPI 3.x structure with metadata.
 *
 * Key correctness point (Paraskakis Pitfall #2): schemaCount is counted from
 * the components.schemas registry keys, NEVER from walking the dereferenced
 * paths tree. After dereference, the tree contains N inline copies of a reused
 * schema. Counting the tree would reproduce the inflation we exist to avoid.
 * Counting the named registry is correct because dereference preserves those keys.
 *
 * See BACKEND-SHARED.md section 6.
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import YAML from 'yaml';
import { AppError } from './errors.js';

const SUPPORTED_OPENAPI = ['3.0', '3.1'];
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

/**
 * Detect and parse the spec text as JSON or YAML.
 */
function parseText(specText, contentType) {
  if (!specText || typeof specText !== 'string') {
    throw new AppError(
      'PARSE_INVALID_SPEC',
      'This file could not be parsed as JSON or YAML.',
      { reason: 'Input is empty or not a string' }
    );
  }

  // Try JSON first if hinted or if text starts with {
  const isLikelyJson = contentType === 'application/json' || specText.trimStart().startsWith('{');

  if (isLikelyJson) {
    try {
      return JSON.parse(specText);
    } catch {
      // Fall through to YAML
    }
  }

  // Try YAML
  try {
    const parsed = YAML.parse(specText);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Fall through
  }

  // Try JSON as last resort (if not already tried)
  if (!isLikelyJson) {
    try {
      return JSON.parse(specText);
    } catch {
      // Fall through
    }
  }

  throw new AppError(
    'PARSE_INVALID_SPEC',
    'This file could not be parsed as JSON or YAML.',
    { contentType }
  );
}

/**
 * Validate that the parsed object looks like an OpenAPI or Swagger spec.
 */
function validateSpecShape(obj) {
  if (!obj || typeof obj !== 'object') {
    throw new AppError(
      'PARSE_INVALID_SPEC',
      'This file does not appear to be an OpenAPI or Swagger specification.'
    );
  }

  const version = obj.openapi || obj.swagger;
  if (!version) {
    throw new AppError(
      'PARSE_INVALID_SPEC',
      'This file does not appear to be an OpenAPI or Swagger specification.'
    );
  }

  // Check supported versions
  if (obj.swagger === '2.0') return '2.0';
  if (obj.openapi) {
    const major = obj.openapi.slice(0, 3); // "3.0" or "3.1"
    if (SUPPORTED_OPENAPI.includes(major)) return obj.openapi;

    throw new AppError(
      'PARSE_UNSUPPORTED_SPEC_VERSION',
      `OpenAPI version ${obj.openapi} is not supported. Perseus supports 3.0.x, 3.1.x, and Swagger 2.0.`,
      { version: obj.openapi }
    );
  }

  throw new AppError(
    'PARSE_INVALID_SPEC',
    'This file does not appear to be an OpenAPI or Swagger specification.'
  );
}

/**
 * Convert a Swagger 2.0 dereferenced spec to OpenAPI 3.x shape.
 * Minimal structural conversion: servers, components.schemas, components.securitySchemes.
 */
function convertSwagger2ToOpenApi3(spec) {
  const converted = {
    openapi: '3.0.0',
    info: spec.info || { title: '', version: '' },
    paths: spec.paths || {}
  };

  // host + basePath + schemes -> servers
  if (spec.host) {
    const scheme = (spec.schemes && spec.schemes[0]) || 'https';
    const basePath = spec.basePath || '';
    converted.servers = [{ url: `${scheme}://${spec.host}${basePath}` }];
  }

  // definitions -> components.schemas
  if (spec.definitions || spec.securityDefinitions) {
    converted.components = {};
    if (spec.definitions) {
      converted.components.schemas = spec.definitions;
    }
    if (spec.securityDefinitions) {
      converted.components.securitySchemes = spec.securityDefinitions;
    }
  }

  // Carry over security at top level
  if (spec.security) {
    converted.security = spec.security;
  }

  // Carry over tags
  if (spec.tags) {
    converted.tags = spec.tags;
  }

  // Carry over externalDocs
  if (spec.externalDocs) {
    converted.externalDocs = spec.externalDocs;
  }

  return converted;
}

/**
 * Count distinct path + HTTP method combinations.
 * Only counts recognized HTTP methods, not path-level parameters.
 */
function countEndpoints(paths) {
  if (!paths || typeof paths !== 'object') return 0;
  let count = 0;
  for (const pathItem of Object.values(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) count++;
    }
  }
  return count;
}

/**
 * Parse an OpenAPI or Swagger specification.
 *
 * @param {string} specText - JSON or YAML spec text
 * @param {string} [contentType] - Optional content-type hint
 * @returns {Promise<{spec: object, metadata: object}>}
 */
export async function parseSpec(specText, contentType) {
  // Step 1: Parse text to object
  const rawObj = parseText(specText, contentType);

  // Step 2: Validate spec shape and version
  const originalVersion = validateSpecShape(rawObj);

  // Step 3: Resolve $refs using swagger-parser
  // This handles circular $refs by inserting JS circular references (not infinite recursion)
  let dereferenced;
  try {
    dereferenced = await SwaggerParser.dereference(structuredClone(rawObj));
  } catch (err) {
    throw new AppError(
      'PARSE_INVALID_SPEC',
      'This file does not appear to be an OpenAPI or Swagger specification.',
      { reason: err.message }
    );
  }

  // Step 4: Convert Swagger 2.0 to OpenAPI 3.x shape
  let normalizedSpec;
  if (originalVersion === '2.0') {
    normalizedSpec = convertSwagger2ToOpenApi3(dereferenced);
  } else {
    normalizedSpec = dereferenced;
  }

  // Step 5: Compute metadata
  // INVARIANT: schemaCount from the components.schemas registry keys ONLY.
  // Never walk the dereferenced paths tree for schema counting.
  // The registry contains each named schema exactly once regardless of how
  // many endpoints reference it. This is the Pitfall #2 defense.
  const schemas = normalizedSpec.components?.schemas || {};
  const schemaCount = Object.keys(schemas).length;

  const metadata = {
    originalVersion,
    title: normalizedSpec.info?.title || null,
    version: normalizedSpec.info?.version || null,
    endpointCount: countEndpoints(normalizedSpec.paths),
    schemaCount,
    hasServers: Array.isArray(normalizedSpec.servers) && normalizedSpec.servers.length > 0,
    hasSecurity: !!(normalizedSpec.components?.securitySchemes
      && Object.keys(normalizedSpec.components.securitySchemes).length > 0)
  };

  return { spec: normalizedSpec, metadata };
}
