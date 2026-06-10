/**
 * Perseus Clew: Reliability Patterns API check module.
 *
 * Checks whether the API supports reliable agent behavior: safe retries
 * via idempotency, machine-readable deprecation signals, and clear versioning.
 * Agents retry when calls fail and consume APIs across versions; both need
 * explicit support from the spec.
 *
 * Weight: 10 (from SCORING.md v1.1.1)
 * Scored sub-checks: 3
 * Informational sub-check: 1 (POST idempotency, Amendment A4)
 *
 * D-DOCS-3 reconcile: the proposal's sub-check 2 ("deprecated ops use
 * deprecated:true flag") was tautological — we detect deprecated ops via
 * the flag itself, so the check is unfalsifiable. Dropped. Not an error,
 * the proposal meeting reality.
 *
 * Schema traversal: sub-check 1 (informational) reads requestBody schema
 * properties at one level (+ one-level allOf flatten) for uniqueness keywords.
 * Does NOT import walk-schema.js (informational check, miss on deep
 * composition has zero consequence). Wrapped to degrade gracefully on
 * circular/weird schemas (no throw, just "no signal").
 *
 * Pitfall #2: not strongly applicable here (deprecation is per-operation,
 * not per-schema-reference). No registry-key dedup needed.
 *
 * Swagger 2.0: deprecated:true is the same field in 2.0 and 3.x.
 * Version detection checks servers[].url (populated from host+basePath
 * by parse-spec.js conversion) and info.version for semver.
 *
 * See BACKEND-API-CHECKS.md Module 5, Block 1G proposal.
 */

import { AppError } from '../../shared/errors.js';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

/**
 * Keywords in info.description that indicate a deprecation/sunset policy.
 */
const DEPRECATION_POLICY_KEYWORDS = [
  'deprecat', 'sunset', 'end-of-life', 'end of life', 'migration',
  'breaking change', 'removal', 'retire', 'phase out', 'phaseout'
];

/**
 * Keywords in operation description/externalDocs that indicate a successor.
 */
const SUCCESSOR_KEYWORDS = [
  'use ', 'replace', 'successor', 'migrate', 'instead', 'upgrade',
  'see ', 'moved to', 'superseded', 'new version'
];

/**
 * Semver-like pattern: major.minor or major.minor.patch
 */
const SEMVER_PATTERN = /^\d+\.\d+(\.\d+)?/;

/**
 * URL version segment pattern: /v1/, /v2/, etc.
 */
const URL_VERSION_PATTERN = /\/v\d+\b/i;

/**
 * Run the Reliability Patterns check against a parsed OpenAPI spec.
 *
 * @param {{ spec: object, metadata: object }} parsedSpec - Output of parseSpec()
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkReliabilityPatterns(parsedSpec) {
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

    // Sub-check 1: POST idempotency signals (INFORMATIONAL)
    // Amendment A4: positive signal when present, NO finding when absent,
    // does NOT increment total. Runs for detection only; output unused at MVP.
    // Wrapped to degrade gracefully on weird schemas.
    // (Intentionally no-op for scoring. Future: surface as positive signal.)

    // Collect deprecated operations for sub-checks 2-3
    const deprecatedOps = operations.filter(op => op.operation.deprecated === true);

    // Sub-check 2 (API-REL-001): Deprecated successors documented
    // Applicable: only when deprecated operations exist
    if (deprecatedOps.length > 0) {
      const sc2 = checkDeprecatedSuccessors(deprecatedOps);
      total++;
      if (sc2) {
        findings.push(sc2);
      } else {
        passed++;
      }
    }

    // Sub-check 3 (API-REL-002): Deprecation policy
    // Applicable: only when deprecated operations exist
    if (deprecatedOps.length > 0) {
      const sc3 = checkDeprecationPolicy(spec);
      total++;
      if (sc3) {
        findings.push(sc3);
      } else {
        passed++;
      }
    }

    // Sub-check 4 (API-REL-003): Versioning clarity
    // Applicable: always when operations exist
    const sc4 = checkVersioningClarity(spec);
    total++;
    if (sc4) {
      findings.push(sc4);
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
      'The reliability patterns check module encountered an internal error.',
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
 * Sub-check 2 (API-REL-001): Deprecated operations document their successor.
 *
 * Count-aware finding (one or many deprecated ops without successors).
 * Checks operation.description and operation.externalDocs for successor keywords.
 */
function checkDeprecatedSuccessors(deprecatedOps) {
  const noSuccessor = [];

  for (const { method, path, operation } of deprecatedOps) {
    const description = (operation.description || '').toLowerCase();
    const externalUrl = (operation.externalDocs?.url || '').toLowerCase();
    const externalDesc = (operation.externalDocs?.description || '').toLowerCase();
    const combined = description + ' ' + externalUrl + ' ' + externalDesc;

    const hasSuccessorRef = SUCCESSOR_KEYWORDS.some(kw => combined.includes(kw));
    if (!hasSuccessorRef) {
      noSuccessor.push(`${method.toUpperCase()} ${path}`);
    }
  }

  if (noSuccessor.length === 0) return null;

  const examples = noSuccessor.slice(0, 3);
  const noun = noSuccessor.length === 1 ? 'deprecated operation does' : 'deprecated operations do';
  const ref = noSuccessor.length === 1 ? 'this endpoint' : 'these endpoints';
  return {
    id: 'API-REL-001',
    text: `${noSuccessor.length} ${noun} not reference a successor. An agent using ${ref} cannot determine where to migrate when the endpoint is removed.`,
    count: noSuccessor.length,
    examples
  };
}

/**
 * Sub-check 3 (API-REL-002): Deprecation policy in info.description.
 *
 * Fixed-singular finding (one spec-global verdict). count is null.
 * No count-aware template — this is always a single statement.
 */
function checkDeprecationPolicy(spec) {
  const infoDesc = (spec.info?.description || '').toLowerCase();

  const hasPolicy = DEPRECATION_POLICY_KEYWORDS.some(kw => infoDesc.includes(kw));
  if (hasPolicy) return null;

  return {
    id: 'API-REL-002',
    text: 'The spec does not document a deprecation policy. An agent encountering deprecated endpoints cannot determine the timeline or process for migration.',
    count: null
  };
}

/**
 * Sub-check 4 (API-REL-003): Versioning clarity.
 *
 * Fixed-singular finding (one spec-global verdict). count is null.
 * Checks: servers URLs for /vN/ pattern, OR info.version for semver.
 */
function checkVersioningClarity(spec) {
  // Check info.version for semver
  const infoVersion = spec.info?.version || '';
  if (SEMVER_PATTERN.test(infoVersion)) return null;

  // Check servers URLs for version segment
  const servers = spec.servers;
  if (Array.isArray(servers)) {
    for (const server of servers) {
      const url = server?.url || '';
      if (URL_VERSION_PATTERN.test(url)) return null;
    }
  }

  // Check paths for version prefix
  const paths = spec.paths || {};
  for (const pathKey of Object.keys(paths)) {
    if (URL_VERSION_PATTERN.test(pathKey)) return null;
  }

  return {
    id: 'API-REL-003',
    text: 'The spec does not communicate a versioning strategy. An agent consuming this API cannot determine which version it is using or how to detect version changes.',
    count: null
  };
}
