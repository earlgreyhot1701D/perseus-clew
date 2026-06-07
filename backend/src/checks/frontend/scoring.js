/**
 * Perseus Clew: Scoring module.
 *
 * Takes the outputs of all six frontend check modules and produces a
 * final score, rating band, and per-category breakdown. Knows nothing
 * about HTML or specific checks — pure arithmetic and labels.
 *
 * Rounding rule: Math.round each category's earned to an integer,
 * then sum the integers to produce the total. The parts always add
 * up to the total exactly (Option A, for user-verifiable transparency).
 * Math.round rounds .5 up (deterministic).
 *
 * See BACKEND-FRONTEND-CHECKS.md section 7.
 */

import { AppError } from '../../shared/errors.js';

const CATEGORY_WEIGHTS = {
  semantic_html: 25,
  form_accessibility: 20,
  aria: 15,
  structured_data: 15,
  content_in_html: 15,
  link_navigation: 10
};

const ZERO_INSTANCE_NOTES = {
  form_accessibility: 'no forms present',
  aria: 'no custom widgets present',
  link_navigation: 'no links present',
  semantic_html: null,
  structured_data: null,
  content_in_html: null
};

const CATEGORY_ORDER = [
  'semantic_html',
  'form_accessibility',
  'aria',
  'structured_data',
  'content_in_html',
  'link_navigation'
];

/**
 * Calculate the total score, rating band, and per-category breakdown.
 *
 * @param {object} categoryResults - Results from all six check modules
 * @returns {{ total: number, rating: string, breakdown: object }}
 */
export function calculateScore(categoryResults) {
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
      'The scoring module received invalid input.',
      { reason: 'Input is not an object' }
    );
  }

  for (const category of CATEGORY_ORDER) {
    const result = categoryResults[category];

    if (!result || typeof result !== 'object') {
      throw new AppError(
        'SCORING_INVALID_INPUT',
        'The scoring module received invalid input.',
        { reason: `Category "${category}" is missing or not an object` }
      );
    }

    if (typeof result.passed !== 'number' || typeof result.total !== 'number') {
      throw new AppError(
        'SCORING_INVALID_INPUT',
        'The scoring module received invalid input.',
        { reason: `Category "${category}" has non-numeric passed or total` }
      );
    }

    if (result.total < 0 || result.passed < 0) {
      throw new AppError(
        'SCORING_INVALID_INPUT',
        'The scoring module received invalid input.',
        { reason: `Category "${category}" has negative passed or total` }
      );
    }
  }
}
