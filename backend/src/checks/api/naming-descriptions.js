/**
 * Perseus Clew: Naming & Descriptions API check module.
 *
 * Checks whether endpoints, parameters, and response fields have clear,
 * descriptive names and descriptions. Agents trust descriptions to decide
 * what each operation does; without them, agents guess.
 *
 * Weight: 25 (from SCORING.md v1.1.1)
 * Sub-checks: 6 (Amendment A2 removed contradiction detection)
 *
 * Pitfall #2 defense: named schemas (components.schemas registry-key members)
 * are scored once regardless of how many endpoints reference them.
 * Property-level descriptions satisfy parent schema requirement at 80%
 * threshold (Amendment A3: documented rationale below).
 *
 * See BACKEND-API-CHECKS.md Module 1, Block 1G proposal.
 */

import { AppError } from '../../shared/errors.js';
import { getRegistryKeyName } from './walk-schema.js';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

/**
 * Minimum description length to be considered meaningful.
 * "gets users" (10 chars) is too short. 20 chars forces a real sentence fragment.
 */
const MIN_DESCRIPTION_LENGTH = 20;

/**
 * Common abbreviations that are self-explaining despite being short.
 * These do NOT generate findings when used as property names without descriptions.
 */
const KNOWN_ABBREVIATIONS = new Set([
  'id', 'url', 'uri', 'api', 'uuid', 'ip', 'http', 'https',
  'sql', 'css', 'js', 'ts', 'html', 'xml', 'json', 'yaml',
  'csv', 'pdf', 'svg', 'png', 'jwt', 'oauth', 'ssl', 'tls',
  'dns', 'cdn', 'aws', 'gcp', 'ttl', 'etag', 'cors'
]);

/**
 * Minimum property name length to be considered self-explaining.
 * Names shorter than this AND not in the abbreviation allowlist generate findings.
 */
const MIN_SELF_EXPLAINING_LENGTH = 4;

/**
 * 80% meaningful-majority threshold for property-level description composability.
 *
 * Rationale (Amendment A3, documented for SCORING.md traceability):
 * When 80% or more of a schema's properties have descriptions, an agent can
 * infer the purpose of the remaining properties from surrounding context.
 * This threshold implements Paraskakis Pitfall #2's composability principle:
 * property-level documentation composes into schema-level understanding.
 * The value 0.8 was chosen as the point where context density is sufficient
 * for inference. Documented in SCORING.md v1.1.1 API Naming & Descriptions section.
 */
const PROPERTY_DESCRIPTION_THRESHOLD = 0.8;

/**
 * Run the Naming & Descriptions check against a parsed OpenAPI spec.
 *
 * @param {{ spec: object, metadata: object }} parsedSpec - Output of parseSpec()
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkNamingDescriptions(parsedSpec) {
  try {
    const { spec } = parsedSpec;
    let passed = 0;
    let total = 0;
    const findings = [];

    const paths = spec.paths || {};
    const operations = extractOperations(paths);

    // Zero-instance: no paths at all
    if (operations.length === 0) {
      return { passed: 1, total: 1, findings: [] };
    }

    // Sub-check 1: Operation has summary or description (API-ND-001)
    const sc1 = checkOperationDescriptions(operations);
    total++;
    if (sc1) {
      findings.push(sc1);
    } else {
      passed++;
    }

    // Sub-check 2: Description length (API-ND-002)
    const sc2 = checkDescriptionLength(operations);
    total++;
    if (sc2) {
      findings.push(sc2);
    } else {
      passed++;
    }

    // Sub-check 3: operationId present (API-ND-003)
    const sc3 = checkOperationId(operations);
    total++;
    if (sc3) {
      findings.push(sc3);
    } else {
      passed++;
    }

    // Sub-check 4: Schema property clarity (API-ND-004)
    // Scored once per named schema via registry-key membership
    const sc4 = checkSchemaPropertyClarity(spec);
    total++;
    if (sc4) {
      findings.push(sc4);
    } else {
      passed++;
    }

    // Sub-check 5: info.description present (API-ND-005)
    const sc5 = checkInfoDescription(spec);
    total++;
    if (sc5) {
      findings.push(sc5);
    } else {
      passed++;
    }

    // Sub-check 6: Tag descriptions (API-ND-006)
    const sc6 = checkTagDescriptions(spec);
    total++;
    if (sc6) {
      findings.push(sc6);
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
      'The naming and descriptions check module encountered an internal error.',
      { originalError: error.message }
    );
  }
}

/**
 * Extract all operations from paths as flat array of { method, path, operation }.
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
 * Sub-check 1: Every operation has summary OR description.
 */
function checkOperationDescriptions(operations) {
  const missing = [];
  for (const { method, path, operation } of operations) {
    const hasSummary = operation.summary && operation.summary.trim().length > 0;
    const hasDescription = operation.description && operation.description.trim().length > 0;
    if (!hasSummary && !hasDescription) {
      missing.push(`${method.toUpperCase()} ${path}`);
    }
  }

  if (missing.length === 0) return null;

  const examples = missing.slice(0, 3);
  const noun = missing.length === 1 ? 'operation has' : 'operations have';
  return {
    id: 'API-ND-001',
    text: `${missing.length} ${noun} no summary or description. An agent reading this spec cannot determine what these endpoints do without additional context.`,
    count: missing.length,
    examples
  };
}

/**
 * Sub-check 2: Descriptions that exist are at least MIN_DESCRIPTION_LENGTH chars.
 */
function checkDescriptionLength(operations) {
  const tooShort = [];
  for (const { method, path, operation } of operations) {
    // Only check operations that HAVE a description (missing ones are caught by sub-check 1)
    const desc = operation.description || operation.summary || '';
    if (desc.trim().length > 0 && desc.trim().length < MIN_DESCRIPTION_LENGTH) {
      tooShort.push(`${method.toUpperCase()} ${path}`);
    }
  }

  if (tooShort.length === 0) return null;

  const examples = tooShort.slice(0, 3);
  const noun = tooShort.length === 1 ? 'operation has' : 'operations have';
  return {
    id: 'API-ND-002',
    text: `${tooShort.length} ${noun} descriptions shorter than ${MIN_DESCRIPTION_LENGTH} characters. An agent relying on these descriptions does not receive enough context to understand the endpoint behavior.`,
    count: tooShort.length,
    examples
  };
}

/**
 * Sub-check 3: Every operation has operationId.
 */
function checkOperationId(operations) {
  const missing = [];
  for (const { method, path, operation } of operations) {
    if (!operation.operationId || operation.operationId.trim().length === 0) {
      missing.push(`${method.toUpperCase()} ${path}`);
    }
  }

  if (missing.length === 0) return null;

  const examples = missing.slice(0, 3);
  const noun = missing.length === 1 ? 'operation' : 'operations';
  return {
    id: 'API-ND-003',
    text: `${missing.length} ${noun} without an operationId. An agent referencing these endpoints has no stable identifier and must construct method+path strings.`,
    count: missing.length,
    examples
  };
}

/**
 * Sub-check 4: Schema property clarity.
 *
 * Iterates components.schemas registry keys (Pitfall #2 defense: each schema
 * scored once regardless of reference count). Checks that properties either
 * have descriptions or self-explaining names.
 *
 * 80% threshold: if >= 80% of properties have descriptions, the schema
 * is considered adequately documented even if a minority lack descriptions.
 */
function checkSchemaPropertyClarity(spec) {
  const schemas = spec.components?.schemas;
  if (!schemas || Object.keys(schemas).length === 0) return null;

  const unclearSchemas = [];

  for (const [schemaName, schema] of Object.entries(schemas)) {
    if (!schema || typeof schema !== 'object') continue;
    if (!schema.properties) continue;

    const properties = Object.entries(schema.properties);
    if (properties.length === 0) continue;

    let describedCount = 0;
    const unclearProps = [];

    for (const [propName, propSchema] of properties) {
      const hasDescription = propSchema?.description && propSchema.description.trim().length > 0;
      const isSelfExplaining = isSelfExplainingName(propName);

      if (hasDescription || isSelfExplaining) {
        describedCount++;
      } else {
        unclearProps.push(propName);
      }
    }

    // 80% threshold: if enough properties are clear, schema passes
    const ratio = describedCount / properties.length;
    if (ratio >= PROPERTY_DESCRIPTION_THRESHOLD) continue;

    if (unclearProps.length > 0) {
      unclearSchemas.push({ schemaName, unclearProps });
    }
  }

  if (unclearSchemas.length === 0) return null;

  const totalUnclear = unclearSchemas.reduce((sum, s) => sum + s.unclearProps.length, 0);
  const examples = unclearSchemas.slice(0, 3).map(s =>
    `${s.schemaName}: ${s.unclearProps.slice(0, 3).join(', ')}`
  );

  const schemaNoun = unclearSchemas.length === 1 ? 'schema has' : 'schemas have';
  return {
    id: 'API-ND-004',
    text: `${unclearSchemas.length} ${schemaNoun} properties with names that are not self-explaining and no descriptions. An agent receiving responses with these fields cannot determine their purpose from the spec alone.`,
    count: totalUnclear,
    examples
  };
}

/**
 * Determine if a property name is self-explaining.
 * Self-explaining = known abbreviation OR at least MIN_SELF_EXPLAINING_LENGTH
 * chars with recognizable word structure (contains a vowel, suggesting a
 * real word rather than an opaque code).
 */
function isSelfExplainingName(name) {
  const lower = name.toLowerCase();

  // Known abbreviations are always self-explaining
  if (KNOWN_ABBREVIATIONS.has(lower)) return true;

  // Too short to be self-explaining
  if (name.length < MIN_SELF_EXPLAINING_LENGTH) return false;

  // Must contain at least one vowel (heuristic: real words have vowels)
  const hasVowel = /[aeiou]/i.test(name);
  return hasVowel;
}

/**
 * Sub-check 5: info.description is present and non-empty.
 */
function checkInfoDescription(spec) {
  const desc = spec.info?.description;
  if (desc && desc.trim().length > 0) return null;

  return {
    id: 'API-ND-005',
    text: 'The spec has no top-level info.description. An agent encountering this API has no summary of what it is for or what resources it manages.',
    count: null
  };
}

/**
 * Sub-check 6: Tags have descriptions (if tags exist).
 */
function checkTagDescriptions(spec) {
  const tags = spec.tags;
  if (!Array.isArray(tags) || tags.length === 0) return null;

  const missingDesc = [];
  for (const tag of tags) {
    if (!tag.description || tag.description.trim().length === 0) {
      missingDesc.push(tag.name || '(unnamed)');
    }
  }

  if (missingDesc.length === 0) return null;

  const examples = missingDesc.slice(0, 3);
  const noun = missingDesc.length === 1 ? 'tag has' : 'tags have';
  return {
    id: 'API-ND-006',
    text: `${missingDesc.length} ${noun} no description. An agent grouping operations by tag cannot understand what each category represents.`,
    count: missingDesc.length,
    examples
  };
}
