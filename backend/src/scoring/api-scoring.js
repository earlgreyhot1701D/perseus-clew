/**
 * Perseus Clew: API Scoring module.
 *
 * Takes the outputs of all six API check modules and produces a final
 * score, rating band, and per-category breakdown. Knows nothing about
 * OpenAPI specs or specific checks — pure arithmetic and labels.
 *
 * Mirrors frontend scoring.js exactly in structure:
 * - Option A rounding: Math.round each category's earned to an integer,
 *   then sum the integers to produce the total. The parts always add
 *   up to the total exactly (user-verifiable transparency).
 * - Same rating bands, same strings, same output shape.
 *
 * 'Not Evaluable' (A6 resolution): the scorer does NOT emit this rating.
 * The modules return { passed:1, total:1 } for zero-instance, which is
 * indistinguishable from a real single-check pass. The scorer cannot
 * reliably infer "nothing was scannable" from the numbers alone. The
 * 'Not Evaluable' determination belongs UPSTREAM in the orchestrator
 * (which knows whether the spec was empty/trivial before calling modules),
 * same pattern as METHODOLOGY_VERSION living in flow.js, not here.
 *
 * L-VER-1: no version string in this file. The orchestrator adds it.
 * This is NOT a 4th copy of '1.1.1'. Single-sourcing deferred to 1M.
 *
 * See BACKEND-API-CHECKS.md API Scoring Module, Block 1G proposal.
 */

import { AppError } from '../shared/errors.js';

const CATEGORY_WEIGHTS = {
  naming_descriptions: 25,
  error_design: 20,
  discoverability: 20,
  response_efficiency: 15,
  reliability_patterns: 10,
  agent_integration: 10
};

const ZERO_INSTANCE_NOTES = {
  naming_descriptions: 'no operations to evaluate',
  error_design: 'no operations to evaluate',
  discoverability: 'no parameterized paths',
  response_efficiency: 'no response schemas or list endpoints',
  reliability_patterns: 'no operations to evaluate',
  agent_integration: 'no operations to evaluate'
};

const CATEGORY_ORDER = [
  'naming_descriptions',
  'error_design',
  'discoverability',
  'response_efficiency',
  'reliability_patterns',
  'agent_integration'
];

/**
 * Calculate the total API score, rating band, and per-category breakdown.
 *
 * @param {object} categoryResults - Results from all six API check modules
 * @returns {{ total: number, rating: string, breakdown: object }}
 */
export function calculateApiScore(categoryResults) {
  validateInput(categoryResults);

  const breakdown = {};
  let total = 0;

  for (const category of CATEGORY_ORDER) {
    const result = categoryResults[category];
    const max = CATEGORY_WEIGHTS[category];
    let earned;
    let note = null;

    if (result.total === 0) {
      // Zero-instance rule: full credit with note
      // (Defensive: no module currently emits total=0, but guard against it)
      earned = max;
      note = ZERO_INSTANCE_NOTES[category];
    } else {
      // Clamp passed to total defensively
      const passed = Math.min(result.passed, result.total);
      earned = Math.round((passed / result.total) * max);
      note = null;
    }

    breakdown[category] = { earned, max, note };
    total += earned;
  }

  const rating = getRating(total);

  return { total, rating, breakdown };
}

/**
 * Determine the rating band from the total score.
 */
function getRating(total) {
  if (total >= 80) return 'Agent-Ready';
  if (total >= 50) return 'Partially Ready';
  return 'Not Yet Readable';
}

/**
 * Validate the input object. Throws SCORING_INVALID_INPUT on contract violations.
 */
function validateInput(categoryResults) {
  if (!categoryResults || typeof categoryResults !== 'object') {
    throw new AppError(
      'SCORING_INVALID_INPUT',
      'The API scoring module received invalid input.',
      { reason: 'Input is not an object' }
    );
  }

  for (const category of CATEGORY_ORDER) {
    const result = categoryResults[category];

    if (!result || typeof result !== 'object') {
      throw new AppError(
        'SCORING_INVALID_INPUT',
        'The API scoring module received invalid input.',
        { reason: `Category "${category}" is missing or not an object` }
      );
    }

    if (typeof result.passed !== 'number' || typeof result.total !== 'number') {
      throw new AppError(
        'SCORING_INVALID_INPUT',
        'The API scoring module received invalid input.',
        { reason: `Category "${category}" has non-numeric passed or total` }
      );
    }

    if (result.total < 0 || result.passed < 0) {
      throw new AppError(
        'SCORING_INVALID_INPUT',
        'The API scoring module received invalid input.',
        { reason: `Category "${category}" has negative passed or total` }
      );
    }
  }
}
