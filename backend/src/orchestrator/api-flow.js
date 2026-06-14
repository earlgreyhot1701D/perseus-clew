/**
 * Perseus Clew: Deterministic API scan flow.
 *
 * The API scanning pipeline: parse spec -> determine evaluability ->
 * run 6 API check modules -> score -> sanitize findings -> assemble report.
 * Mirrors flow.js (the frontend pipeline) in structure.
 *
 * ASYNC: parseSpec uses SwaggerParser.dereference internally (in-memory
 * ref resolution for local $refs; remote $refs are a network surface
 * handled by SwaggerParser's built-in resolver with timeout — failures
 * are caught as PARSE_INVALID_SPEC).
 *
 * L-APIFLOW-1 (Not Evaluable): an empty spec (endpointCount === 0) is
 * short-circuited BEFORE modules run. Returns total:null + 'Not Evaluable'.
 * This prevents the modules from returning their zero-instance shape
 * ({passed:1,total:1}) which the scorer would turn into a misleading 100.
 *
 * Per-module isolation (1J mirror): each check module runs in its own
 * try/catch. A crashed module degrades to {passed:0, total:1, findings:[]},
 * earning zero (not full credit via total:0).
 *
 * L-1K-SHAPES (NOTE for benchmark block 1K): runApiScan returns one of
 * THREE shapes — normal score, {total:null, 'Not Evaluable'}, or
 * {error:true, code, message}. The benchmark batch must handle all three.
 *
 * See BACKEND-API-CHECKS.md, Block 1J5 proposal.
 */

import { parseSpec } from '../shared/parse-spec.js';
import { sanitize } from '../shared/sanitize.js';
import { checkNamingDescriptions } from '../checks/api/naming-descriptions.js';
import { checkErrorDesign } from '../checks/api/error-design.js';
import { checkDiscoverability } from '../checks/api/discoverability.js';
import { checkResponseEfficiency } from '../checks/api/response-efficiency.js';
import { checkReliabilityPatterns } from '../checks/api/reliability-patterns.js';
import { checkAgentIntegration } from '../checks/api/agent-integration.js';
import { calculateApiScore } from '../scoring/api-scoring.js';

const METHODOLOGY_VERSION = '1.1.1';

/**
 * Run the deterministic API scan pipeline.
 *
 * @param {string} specText - Raw JSON or YAML spec text
 * @param {string} [contentType] - Optional content-type hint for parser
 * @returns {Promise<object>} The API report object, or an error shape
 */
export async function runApiScan(specText, contentType) {
  // 1. Parse the spec
  let parsedSpec;
  try {
    parsedSpec = await parseSpec(specText, contentType);
  } catch (err) {
    // Parse failure: return structured error (distinct from Not Evaluable)
    return {
      error: true,
      code: err.code || 'PARSE_INVALID_SPEC',
      message: err.userMessage || err.message || 'The spec could not be parsed.'
    };
  }

  const { spec, metadata } = parsedSpec;

  // 2. Empty-spec determination (L-APIFLOW-1)
  // Short-circuit BEFORE modules run. An empty spec with no operations
  // would otherwise produce zero-instance full-credit from all modules
  // -> misleading 100/Agent-Ready. Catch it at the source.
  if (metadata.endpointCount === 0) {
    return {
      error: false,
      meta: {
        scanType: 'spec',
        specTitle: metadata.title,
        specVersion: metadata.version,
        endpointCount: 0,
        schemaCount: metadata.schemaCount,
        methodologyVersion: METHODOLOGY_VERSION
      },
      scoredViews: {
        api: {
          score: { total: null, rating: 'Not Evaluable', breakdown: {} },
          findings: {}
        }
      }
    };
  }

  // 3. Run 6 API check modules (isolated per 1J pattern)
  const checkResults = {};
  const checkModules = [
    ['naming_descriptions', () => checkNamingDescriptions(parsedSpec)],
    ['error_design', () => checkErrorDesign(parsedSpec)],
    ['discoverability', () => checkDiscoverability(parsedSpec)],
    ['response_efficiency', () => checkResponseEfficiency(parsedSpec)],
    ['reliability_patterns', () => checkReliabilityPatterns(parsedSpec)],
    ['agent_integration', () => checkAgentIntegration(parsedSpec)]
  ];

  for (const [key, runCheck] of checkModules) {
    try {
      checkResults[key] = runCheck();
    } catch {
      // Degraded: one applicable check, zero passed. Scorer gives 0 points.
      // total:1 (NOT total:0 which scorer treats as zero-instance full credit)
      checkResults[key] = { passed: 0, total: 1, findings: [] };
    }
  }

  // 4. Score (deterministic)
  const score = calculateApiScore(checkResults);

  // 5. Sanitize finding text
  const sanitizedFindings = {};
  for (const [category, result] of Object.entries(checkResults)) {
    const findings = result.findings || [];
    sanitizedFindings[category] = findings.map(finding => ({
      id: finding.id,
      text: sanitize(finding.text),
      count: finding.count,
      ...(finding.examples ? { examples: finding.examples } : {})
    }));
  }

  // 6. Assemble report
  return {
    error: false,
    meta: {
      scanType: 'spec',
      specTitle: metadata.title,
      specVersion: metadata.version,
      endpointCount: metadata.endpointCount,
      schemaCount: metadata.schemaCount,
      methodologyVersion: METHODOLOGY_VERSION
    },
    scoredViews: {
      api: {
        score: {
          total: score.total,
          rating: score.rating,
          breakdown: score.breakdown
        },
        findings: sanitizedFindings
      }
    }
  };
}
