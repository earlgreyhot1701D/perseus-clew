/**
 * Perseus Clew: Form Accessibility check module.
 *
 * Examines whether form inputs are labeled, structured, and reachable
 * in ways agents can understand. An agent filling a form needs to know
 * what each field expects.
 *
 * See BACKEND-FRONTEND-CHECKS.md section 2.
 */

import { AppError } from '../../shared/errors.js';

/**
 * Run the form accessibility check against parsed HTML.
 *
 * @param {{ $: import('cheerio').CheerioAPI, metadata: object }} parsedHtml
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkFormAccessibility(parsedHtml) {
  try {
    const { $ } = parsedHtml;

    // Zero-instance gate: no form controls at all -> nothing to check
    const allControls = $('input, select, textarea').filter((_, el) => {
      const type = ($(el).attr('type') || '').toLowerCase();
      return type !== 'hidden';
    });

    if (allControls.length === 0) {
      return { passed: 0, total: 0, findings: [] };
    }

    let passed = 0;
    let total = 0;
    const findings = [];

    // Classify each input for checks 1 and 2
    const { bareInputs, placeholderOnlyInputs } = classifyLabeling($, allControls);

    // Sub-check 1: Inputs with no labeling signal at all (FORM-001)
    total++;
    if (bareInputs.length > 0) {
      findings.push(buildFinding001(bareInputs.length));
    } else {
      passed++;
    }

    // Sub-check 2: Placeholder as only label (FORM-002)
    total++;
    if (placeholderOnlyInputs.length > 0) {
      findings.push(buildFinding002(placeholderOnlyInputs.length));
    } else {
      passed++;
    }

    // Sub-check 3: Required inputs marked (FORM-003)
    const unmarkedRequired = findUnmarkedRequired($, allControls);
    if (unmarkedRequired.applicable) {
      total++;
      if (unmarkedRequired.count > 0) {
        findings.push(buildFinding003(unmarkedRequired.count));
      } else {
        passed++;
      }
    }

    // Sub-check 4: Input types specific (FORM-004)
    const typeMismatches = findTypeMismatches($, allControls);
    if (typeMismatches.applicable) {
      total++;
      if (typeMismatches.count > 0) {
        findings.push(buildFinding004(typeMismatches.count));
      } else {
        passed++;
      }
    }

    // Sub-check 5: Submit controls exist (FORM-005)
    const forms = $('form');
    if (forms.length > 0) {
      total++;
      const formsWithoutSubmit = countFormsWithoutSubmit($, forms);
      if (formsWithoutSubmit > 0) {
        findings.push(buildFinding005(formsWithoutSubmit));
      } else {
        passed++;
      }
    }

    // Sub-check 6: Fieldset grouping (FORM-006)
    const looseGroups = findLooseGroups($, allControls);
    if (looseGroups.applicable) {
      total++;
      if (looseGroups.count > 0) {
        findings.push(buildFinding006(looseGroups.count));
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
      'The form accessibility check module encountered an internal error.',
      { originalError: error.message }
    );
  }
}

// --- Labeling classification (checks 1 & 2, disjoint) ---

function classifyLabeling($, allControls) {
  const bareInputs = [];
  const placeholderOnlyInputs = [];

  allControls.each((_, el) => {
    const $el = $(el);
    if (hasRealLabel($, $el)) {
      return; // properly labeled, skip
    }
    // No real label. Does it have a placeholder?
    const placeholder = $el.attr('placeholder');
    if (placeholder && placeholder.trim()) {
      placeholderOnlyInputs.push(el);
    } else {
      bareInputs.push(el);
    }
  });

  return { bareInputs, placeholderOnlyInputs };
}

function hasRealLabel($, $el) {
  // 1. aria-label or aria-labelledby
  if ($el.attr('aria-label') || $el.attr('aria-labelledby')) {
    return true;
  }

  // 2. Matching <label for="id">
  const id = $el.attr('id');
  if (id && $(`label[for="${id}"]`).length > 0) {
    return true;
  }

  // 3. Wrapped inside a <label>
  if ($el.closest('label').length > 0) {
    return true;
  }

  return false;
}

// --- Check 3: Required inputs not marked ---

function findUnmarkedRequired($, allControls) {
  let unmarkedCount = 0;
  let hasAsteriskSignal = false;

  allControls.each((_, el) => {
    const $el = $(el);

    // Already marked as required? Skip.
    if ($el.attr('required') !== undefined || $el.attr('aria-required') === 'true') {
      return;
    }

    // Look for asterisk signal in associated label text
    if (hasAsteriskInLabel($, $el)) {
      hasAsteriskSignal = true;
      unmarkedCount++;
    }
  });

  return { applicable: hasAsteriskSignal || unmarkedCount > 0, count: unmarkedCount };
}

function hasAsteriskInLabel($, $el) {
  // Check label text via for= attribute
  const id = $el.attr('id');
  if (id) {
    const labelText = $(`label[for="${id}"]`).text();
    if (labelText && labelText.includes('*')) {
      return true;
    }
  }

  // Check wrapping label text
  const wrappingLabel = $el.closest('label');
  if (wrappingLabel.length > 0) {
    const labelText = wrappingLabel.text();
    if (labelText && labelText.includes('*')) {
      return true;
    }
  }

  // Check immediately adjacent sibling text for asterisk
  const prev = $el.prev();
  if (prev.length > 0 && prev.text().includes('*')) {
    return true;
  }

  return false;
}

// --- Check 4: Input types specific ---

const TYPE_HINTS = {
  email: ['email', 'e-mail'],
  tel: ['tel', 'phone', 'mobile', 'fax'],
  url: ['url', 'website', 'homepage']
};

const NUMERIC_AUTOCOMPLETE = ['cc-number', 'postal-code'];

function findTypeMismatches($, allControls) {
  let mismatchCount = 0;
  let hasEvidenceBearingInput = false;

  allControls.each((_, el) => {
    const $el = $(el);
    const type = ($el.attr('type') || 'text').toLowerCase();

    // Only check type="text" or no type (defaults to text)
    if (type !== 'text') return;

    const name = ($el.attr('name') || '').toLowerCase();
    const id = ($el.attr('id') || '').toLowerCase();
    const autocomplete = ($el.attr('autocomplete') || '').toLowerCase();

    // Check autocomplete for numeric types
    if (NUMERIC_AUTOCOMPLETE.includes(autocomplete)) {
      hasEvidenceBearingInput = true;
      mismatchCount++;
      return;
    }

    // Check name/id/autocomplete for email/tel/url
    for (const [, tokens] of Object.entries(TYPE_HINTS)) {
      for (const token of tokens) {
        // Match as whole token in name/id (split on common separators)
        if (matchesToken(name, token) || matchesToken(id, token) || autocomplete === token) {
          hasEvidenceBearingInput = true;
          mismatchCount++;
          return;
        }
      }
    }
  });

  return { applicable: hasEvidenceBearingInput, count: mismatchCount };
}

/**
 * Check if a field name/id contains a token as a whole word segment.
 * Splits on common separators: _ - . and camelCase boundaries.
 */
function matchesToken(fieldValue, token) {
  if (!fieldValue) return false;
  // Normalize camelCase to segments
  const segments = fieldValue
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\-.\s]+/);
  return segments.includes(token);
}

// --- Check 5: Submit controls ---

function countFormsWithoutSubmit($, forms) {
  let count = 0;
  forms.each((_, form) => {
    const $form = $(form);
    const hasSubmit =
      $form.find('button[type="submit"]').length > 0 ||
      $form.find('button:not([type])').length > 0 ||
      $form.find('input[type="submit"]').length > 0 ||
      $form.find('input[type="image"]').length > 0;
    if (!hasSubmit) {
      count++;
    }
  });
  return count;
}

// --- Check 6: Fieldset grouping ---

function findLooseGroups($, allControls) {
  const radioGroups = {};
  const checkboxGroups = {};

  allControls.each((_, el) => {
    const $el = $(el);
    const type = ($el.attr('type') || '').toLowerCase();
    const name = $el.attr('name');

    if (!name) return;

    if (type === 'radio') {
      if (!radioGroups[name]) radioGroups[name] = [];
      radioGroups[name].push(el);
    } else if (type === 'checkbox') {
      if (!checkboxGroups[name]) checkboxGroups[name] = [];
      checkboxGroups[name].push(el);
    }
  });

  let looseCount = 0;
  let hasGroups = false;

  // Check radio groups (2+ same name)
  for (const name of Object.keys(radioGroups)) {
    if (radioGroups[name].length < 2) continue;
    hasGroups = true;
    // Are they inside a fieldset?
    const $first = $(radioGroups[name][0]);
    if ($first.closest('fieldset').length === 0) {
      looseCount++;
    }
  }

  // Check checkbox groups (2+ same name)
  for (const name of Object.keys(checkboxGroups)) {
    if (checkboxGroups[name].length < 2) continue;
    hasGroups = true;
    const $first = $(checkboxGroups[name][0]);
    if ($first.closest('fieldset').length === 0) {
      looseCount++;
    }
  }

  return { applicable: hasGroups, count: looseCount };
}

// --- Finding builders ---

function buildFinding001(count) {
  const noun = count === 1 ? 'input field has' : 'input fields have';
  const pronoun = count === 1 ? 'this field expects' : 'these fields expect';
  return {
    id: 'FORM-001',
    text: `${count} ${noun} no labeling signal at all. Agents filling this form cannot determine what ${pronoun}.`,
    count
  };
}

function buildFinding002(count) {
  const noun = count === 1 ? 'input field relies' : 'input fields rely';
  const pronoun = count === 1 ? 'this field expects' : 'these fields expect';
  return {
    id: 'FORM-002',
    text: `${count} ${noun} on placeholder text alone for labeling. Agents filling this form cannot reliably determine what ${pronoun}.`,
    count
  };
}

function buildFinding003(count) {
  const noun = count === 1 ? 'input field appears' : 'input fields appear';
  const pronoun = count === 1 ? 'this field' : 'these fields';
  return {
    id: 'FORM-003',
    text: `${count} ${noun} to be required (labeled with an asterisk) but has no required attribute or aria-required. Agents determining which fields are mandatory cannot identify ${pronoun} as required.`,
    count
  };
}

function buildFinding004(count) {
  const noun = count === 1 ? 'input field that accepts' : 'input fields that accept';
  const pronoun = count === 1 ? 'this field' : 'these fields';
  return {
    id: 'FORM-004',
    text: `${count} ${noun} a specific data type (email, phone, URL) uses type="text" instead of the matching input type. Agents parsing input expectations by type cannot distinguish ${pronoun} from generic text fields.`,
    count
  };
}

function buildFinding005(count) {
  const noun = count === 1 ? 'form has' : 'forms have';
  return {
    id: 'FORM-005',
    text: `${count} ${noun} no submit button or input of type submit. Agents identifying the form completion control cannot locate it.`,
    count
  };
}

function buildFinding006(count) {
  const noun = count === 1 ? 'group' : 'groups';
  return {
    id: 'FORM-006',
    text: `${count} ${noun} of related inputs (radio buttons or checkboxes sharing a name) are not wrapped in a fieldset with a legend. Agents parsing form structure cannot identify these as a single choice group.`,
    count
  };
}
