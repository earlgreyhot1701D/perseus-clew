/**
 * Perseus Clew: ARIA check module.
 *
 * Examines whether dynamic widgets use ARIA roles and states that
 * agents can interpret. ARIA is how HTML communicates dynamic component
 * state to assistive technologies and to agents.
 *
 * See BACKEND-FRONTEND-CHECKS.md section 3.
 */

import { AppError } from '../../shared/errors.js';

// --- Token sets ---

const WIDGET_TOKENS = new Set([
  'dropdown', 'tab', 'dialog', 'modal', 'combobox', 'accordion',
  'menu', 'carousel', 'tooltip', 'collapse', 'popup', 'popover', 'listbox'
]);

const LIVE_REGION_TOKENS = new Set([
  'toast', 'notification', 'alert', 'status', 'flash', 'snackbar'
]);

const EXPANDABLE_TOKENS = new Set([
  'accordion', 'collapse', 'dropdown', 'menu', 'popup', 'popover'
]);

const SEMANTIC_TAGS = new Set([
  'button', 'a', 'nav', 'main', 'header', 'footer', 'section',
  'article', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'form', 'input', 'select', 'textarea'
]);

const INTERACTIVE_ATTRS = [
  'onclick', 'onClick', 'onkeydown', 'onKeyDown',
  'onkeyup', 'onKeyUp', 'onpress', 'onPress'
];

const ROLE_COMPANIONS = {
  button: { attr: 'tabindex', nativeExempt: ['button', 'a', 'input'] },
  tab: { attr: 'aria-selected', nativeExempt: [] },
  checkbox: { attr: 'aria-checked', nativeExempt: ['input'] },
  switch: { attr: 'aria-checked', nativeExempt: [] },
  radio: { attr: 'aria-checked', nativeExempt: ['input'] },
  option: { attr: 'aria-selected', nativeExempt: ['option'] }
};

/**
 * Run the ARIA check against parsed HTML.
 *
 * @param {{ $: import('cheerio').CheerioAPI, metadata: object }} parsedHtml
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkAria(parsedHtml) {
  try {
    const { $ } = parsedHtml;
    let passed = 0;
    let total = 0;
    const findings = [];

    // Sub-check 1: Custom widgets missing roles (ARIA-001)
    const widgetsMissingRoles = checkWidgetRoles($);
    if (widgetsMissingRoles.applicable) {
      total++;
      if (widgetsMissingRoles.count > 0) {
        findings.push(buildFinding001(widgetsMissingRoles.count));
      } else {
        passed++;
      }
    }

    // Sub-check 2: Interactive roles missing companions (ARIA-002)
    const rolesMissingCompanions = checkRoleCompanions($);
    if (rolesMissingCompanions.applicable) {
      total++;
      if (rolesMissingCompanions.count > 0) {
        findings.push(buildFinding002(rolesMissingCompanions.count));
      } else {
        passed++;
      }
    }

    // Sub-check 3: State attributes missing (ARIA-003)
    const missingStates = checkStateAttributes($);
    if (missingStates.applicable) {
      total++;
      if (missingStates.count > 0) {
        findings.push(buildFinding003(missingStates.count));
      } else {
        passed++;
      }
    }

    // Sub-check 4: Labels where required (ARIA-004)
    const unlabeledButtons = checkButtonLabels($);
    if (unlabeledButtons.applicable) {
      total++;
      if (unlabeledButtons.count > 0) {
        findings.push(buildFinding004(unlabeledButtons.count));
      } else {
        passed++;
      }
    }

    // Sub-check 5: Live regions (ARIA-005)
    const missingLiveRegions = checkLiveRegions($);
    if (missingLiveRegions.applicable) {
      total++;
      if (missingLiveRegions.count > 0) {
        findings.push(buildFinding005(missingLiveRegions.count));
      } else {
        passed++;
      }
    }

    // Sub-check 6: Conflicting ARIA (ARIA-006)
    const conflicts = checkConflictingAria($);
    if (conflicts.applicable) {
      total++;
      if (conflicts.count > 0) {
        findings.push(buildFinding006(conflicts.count));
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
      'The ARIA check module encountered an internal error.',
      { originalError: error.message }
    );
  }
}

// --- Tokenizer ---

/**
 * Tokenize a class attribute or id into lowercase whole-word segments.
 * Splits on camelCase boundaries BEFORE lowercasing, then on - _ spaces.
 */
function tokenize(value) {
  if (!value) return [];
  return value
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter(Boolean);
}

function hasWidgetToken(classAttr) {
  const tokens = tokenize(classAttr);
  return tokens.some(t => WIDGET_TOKENS.has(t));
}

function hasExpandableToken(classAttr) {
  const tokens = tokenize(classAttr);
  return tokens.some(t => EXPANDABLE_TOKENS.has(t));
}

function hasLiveRegionToken(value) {
  const tokens = tokenize(value);
  return tokens.some(t => LIVE_REGION_TOKENS.has(t));
}

// --- Interactivity detection ---

function hasInteractivitySignal($, $el) {
  for (const attr of INTERACTIVE_ATTRS) {
    if ($el.attr(attr) !== undefined) return true;
  }
  if ($el.attr('tabindex') !== undefined) return true;
  // Contains a focusable child
  if ($el.find('a[href], button, input, select, textarea, [tabindex]').length > 0) {
    return true;
  }
  return false;
}

// --- Check 1: Widget classes missing roles ---

function checkWidgetRoles($) {
  let count = 0;
  let applicable = false;

  $('[class]').each((_, el) => {
    const $el = $(el);
    const classAttr = $el.attr('class') || '';
    if (!hasWidgetToken(classAttr)) return;
    if (!hasInteractivitySignal($, $el)) return;

    applicable = true;
    if (!$el.attr('role')) {
      count++;
    }
  });

  return { applicable, count };
}

// --- Check 2: Interactive roles missing companions ---

function checkRoleCompanions($) {
  let count = 0;
  let applicable = false;

  $('[role]').each((_, el) => {
    const $el = $(el);
    const role = ($el.attr('role') || '').toLowerCase();
    const rule = ROLE_COMPANIONS[role];
    if (!rule) return;

    const tag = (el.tagName || el.name || '').toLowerCase();

    // Skip native elements that already have the semantics
    if (rule.nativeExempt.includes(tag)) return;

    applicable = true;

    if (rule.attr === 'tabindex') {
      if ($el.attr('tabindex') === undefined) {
        count++;
      }
    } else {
      if ($el.attr(rule.attr) === undefined) {
        count++;
      }
    }
  });

  return { applicable, count };
}

// --- Check 3: State attributes missing ---

function checkStateAttributes($) {
  let count = 0;
  let applicable = false;

  // Expandable widgets (class-based + interactivity)
  $('[class]').each((_, el) => {
    const $el = $(el);
    const classAttr = $el.attr('class') || '';
    if (!hasExpandableToken(classAttr)) return;
    if (!hasInteractivitySignal($, $el)) return;

    applicable = true;
    if ($el.attr('aria-expanded') === undefined) {
      count++;
    }
  });

  // Toggle buttons: role="button" + class contains "toggle"
  $('[role="button"]').each((_, el) => {
    const $el = $(el);
    const classAttr = $el.attr('class') || '';
    const tokens = tokenize(classAttr);
    if (!tokens.includes('toggle')) return;

    applicable = true;
    if ($el.attr('aria-pressed') === undefined) {
      count++;
    }
  });

  // Dialogs: role="dialog" or role="alertdialog"
  $('[role="dialog"], [role="alertdialog"]').each((_, el) => {
    const $el = $(el);
    applicable = true;
    if ($el.attr('aria-modal') === undefined) {
      count++;
    }
  });

  // Dialog/modal by class (without role="dialog" already handled above)
  $('[class]').each((_, el) => {
    const $el = $(el);
    const classAttr = $el.attr('class') || '';
    const tokens = tokenize(classAttr);
    if (!tokens.includes('dialog') && !tokens.includes('modal')) return;
    const role = ($el.attr('role') || '').toLowerCase();
    if (role === 'dialog' || role === 'alertdialog') return;
    if (!hasInteractivitySignal($, $el)) return;

    applicable = true;
    if ($el.attr('aria-modal') === undefined) {
      count++;
    }
  });

  return { applicable, count };
}

// --- Check 4: Button labels ---

function checkButtonLabels($) {
  let count = 0;
  let applicable = false;

  const buttons = $('button, [role="button"]');
  buttons.each((_, el) => {
    const $el = $(el);

    // Has text content?
    const text = $el.text().trim();
    if (text) return;

    // Has aria-label or aria-labelledby?
    if ($el.attr('aria-label') || $el.attr('aria-labelledby')) return;

    // Has title?
    if ($el.attr('title')) return;

    // This button has no accessible name — it's a candidate that could fail
    applicable = true;
    count++;
  });

  return { applicable, count };
}

// --- Check 5: Live regions ---

function checkLiveRegions($) {
  let count = 0;
  let applicable = false;

  $('[class], [id]').each((_, el) => {
    const $el = $(el);
    const classAttr = $el.attr('class') || '';
    const idAttr = $el.attr('id') || '';

    if (!hasLiveRegionToken(classAttr) && !hasLiveRegionToken(idAttr)) return;

    applicable = true;

    // Has aria-live or a live-region role?
    if ($el.attr('aria-live') !== undefined) return;
    const role = ($el.attr('role') || '').toLowerCase();
    if (role === 'alert' || role === 'status' || role === 'log') return;

    count++;
  });

  return { applicable, count };
}

// --- Check 6: Conflicting ARIA ---

function checkConflictingAria($) {
  let count = 0;
  let applicable = false;

  // Case a: role="presentation" or role="none" on semantic tags
  $('[role="presentation"], [role="none"]').each((_, el) => {
    const tag = (el.tagName || el.name || '').toLowerCase();
    if (SEMANTIC_TAGS.has(tag)) {
      applicable = true;
      count++;
    }
  });

  // Case b: aria-hidden="true" containing focusable children
  $('[aria-hidden="true"]').each((_, el) => {
    const $el = $(el);
    const focusable = $el.find('a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]');
    if (focusable.length > 0) {
      applicable = true;
      count++;
    }
  });

  return { applicable, count };
}

// --- Finding builders ---

function buildFinding001(count) {
  const noun = count === 1 ? 'element' : 'elements';
  const verb = count === 1 ? 'has' : 'have';
  const pronoun = count === 1 ? 'this control does' : 'these controls do';
  return {
    id: 'ARIA-001',
    text: `${count} ${noun} with a widget-like class name (e.g. dropdown, accordion) ${verb} no role attribute. Agents identifying widgets by ARIA role cannot determine what ${pronoun}.`,
    count
  };
}

function buildFinding002(count) {
  const noun = count === 1 ? 'element with an interactive ARIA role is' : 'elements with interactive ARIA roles are';
  const possessive = count === 1 ? 'its' : 'their';
  const pronoun = count === 1 ? 'this control' : 'these controls';
  return {
    id: 'ARIA-002',
    text: `${count} ${noun} missing ${possessive} required companion attribute (e.g. aria-selected for tabs, aria-checked for checkboxes). Agents reading widget state cannot determine the current state of ${pronoun}.`,
    count
  };
}

function buildFinding003(count) {
  const noun = count === 1 ? 'expandable or toggle control has' : 'expandable or toggle controls have';
  const pronoun = count === 1 ? 'this control is active' : 'these controls are active';
  return {
    id: 'ARIA-003',
    text: `${count} ${noun} no state attribute (aria-expanded, aria-pressed, or aria-modal). Agents tracking open and closed state cannot determine whether ${pronoun}.`,
    count
  };
}

function buildFinding004(count) {
  const noun = count === 1 ? 'button has' : 'buttons have';
  const pronoun = count === 1 ? 'this button does' : 'these buttons do';
  return {
    id: 'ARIA-004',
    text: `${count} ${noun} no accessible name (no text content, aria-label, or aria-labelledby). Agents selecting controls by label cannot identify what ${pronoun}.`,
    count
  };
}

function buildFinding005(count) {
  const noun = count === 1 ? 'element with a dynamic-content class name (e.g. toast, notification) has' : 'elements with dynamic-content class names have';
  const pronoun = count === 1 ? 'this region changes' : 'these regions change';
  return {
    id: 'ARIA-005',
    text: `${count} ${noun} no aria-live attribute or live-region role. Agents monitoring page updates cannot detect when ${pronoun}.`,
    count
  };
}

function buildFinding006(count) {
  const noun = count === 1 ? 'element has' : 'elements have';
  const pronoun = count === 1 ? 'this element' : 'these elements';
  return {
    id: 'ARIA-006',
    text: `${count} ${noun} conflicting ARIA (presentation role on a semantic tag, or aria-hidden on a container with focusable children). Agents interpreting ${pronoun} receive contradictory signals.`,
    count
  };
}
