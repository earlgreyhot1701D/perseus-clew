/**
 * Perseus Clew: Content in HTML check module.
 *
 * Examines whether the page's actual content is present in the initial
 * HTML response, or whether it requires JavaScript to render. An agent
 * that does not execute JavaScript sees only the raw HTML.
 *
 * See BACKEND-FRONTEND-CHECKS.md section 5.
 */

import { AppError } from '../../shared/errors.js';

const CONTENT_THRESHOLD = 200;
const SCRIPT_DOMINANCE_CONTENT_GATE = 500;

const PLACEHOLDER_TITLES = new Set([
  '',
  'loading...',
  'loading',
  'untitled',
  'untitled document',
  'document',
  'react app',
  'vite app',
  'next app',
  'nuxt app',
  'angular app',
  'webpack app',
  'create react app'
]);

const NOSCRIPT_PATTERNS = [
  'enable javascript',
  'requires javascript',
  'javascript is required',
  'javascript must be enabled',
  'you need javascript',
  'this site requires javascript',
  'please enable javascript',
  'javascript is not enabled',
  'javascript is disabled'
];

const TEMPLATE_PLACEHOLDER_RE = /^\s*(\{\{.*\}\}|\{%.*%\}|%[A-Z_]+%)\s*$/;

/**
 * Run the content-in-HTML check against parsed HTML.
 *
 * @param {{ $: import('cheerio').CheerioAPI, metadata: object }} parsedHtml
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkContentHtml(parsedHtml) {
  try {
    const { $, metadata } = parsedHtml;
    let passed = 0;
    let total = 0;
    const findings = [];

    // Shared measurement for checks 1 and 2: body text length excluding script/style
    const bodyClone = $('body').clone();
    bodyClone.find('script, style').remove();
    const bodyText = bodyClone.text().trim();
    const textLength = bodyText.length;

    // Sub-check 1: Body text content (CONT-001) — always applicable
    total++;
    if (textLength >= CONTENT_THRESHOLD) {
      passed++;
    } else {
      findings.push(buildFinding001(textLength));
    }

    // Sub-check 2: Script dominance (CONT-002) — always applicable
    total++;
    const isScriptDominant = checkScriptDominance($, textLength);
    if (isScriptDominant) {
      findings.push(buildFinding002());
    } else {
      passed++;
    }

    // Sub-check 3: Title not placeholder (CONT-003) — always applicable
    total++;
    const titleValue = (metadata.title || '').trim();
    if (PLACEHOLDER_TITLES.has(titleValue.toLowerCase())) {
      findings.push(buildFinding003(titleValue || '(empty)'));
    } else {
      passed++;
    }

    // Sub-check 4: No noscript JS-requirement message (CONT-004) — always applicable
    total++;
    if (hasJsRequirementNoscript($)) {
      findings.push(buildFinding004());
    } else {
      passed++;
    }

    // Sub-check 5: Heading content readable (CONT-005) — only if headings exist
    const headings = $('h1, h2, h3, h4, h5, h6');
    if (headings.length > 0) {
      total++;
      const emptyHeadingCount = countEmptyHeadings($, headings);
      if (emptyHeadingCount > 0) {
        findings.push(buildFinding005(emptyHeadingCount));
      } else {
        passed++;
      }
    }

    // Sub-check 6: Anchor text meaningful (CONT-006) — only if anchors exist
    const anchors = $('a');
    if (anchors.length > 0) {
      total++;
      const textlessAnchorCount = countTextlessAnchors($, anchors);
      if (textlessAnchorCount > 0) {
        findings.push(buildFinding006(textlessAnchorCount));
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
      'The content HTML check module encountered an internal error.',
      { originalError: error.message }
    );
  }
}

// --- Check 2: Script dominance (dual-gate) ---

function checkScriptDominance($, textLength) {
  // Gate 1: content must be below threshold
  if (textLength >= SCRIPT_DOMINANCE_CONTENT_GATE) {
    return false;
  }

  // Gate 2: script-dominant structure
  const bodyChildren = $('body').children();
  let scriptCount = 0;
  let nonScriptStyleCount = 0;

  bodyChildren.each((_, el) => {
    const tag = (el.tagName || el.name || '').toLowerCase();
    if (tag === 'script') {
      scriptCount++;
    } else if (tag !== 'style') {
      nonScriptStyleCount++;
    }
  });

  // Script-dominant: more than 50% of body direct children are scripts,
  // OR there are scripts but fewer than 3 non-script/non-style elements
  if (scriptCount === 0) return false;

  const totalChildren = scriptCount + nonScriptStyleCount;
  if (totalChildren === 0) return false;

  const scriptRatio = scriptCount / totalChildren;
  if (scriptRatio > 0.5) return true;
  if (nonScriptStyleCount < 3) return true;

  return false;
}

// --- Check 4: Noscript JS-requirement ---

function hasJsRequirementNoscript($) {
  let found = false;
  $('noscript').each((_, el) => {
    if (found) return;
    const text = $(el).text().toLowerCase();
    for (const pattern of NOSCRIPT_PATTERNS) {
      if (text.includes(pattern)) {
        found = true;
        return;
      }
    }
  });
  return found;
}

// --- Check 5: Empty/placeholder headings ---

function countEmptyHeadings($, headings) {
  let count = 0;
  headings.each((_, el) => {
    const text = $(el).text().trim();
    if (!text || TEMPLATE_PLACEHOLDER_RE.test(text)) {
      count++;
    }
  });
  return count;
}

// --- Check 6: Textless anchors ---

function countTextlessAnchors($, anchors) {
  let count = 0;
  anchors.each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (text) return;
    if ($el.attr('aria-label') || $el.attr('aria-labelledby')) return;
    if ($el.attr('title')) return;
    count++;
  });
  return count;
}

// --- Finding builders ---

function buildFinding001(charCount) {
  return {
    id: 'CONT-001',
    text: `The body contains ${charCount} characters of text outside of script and style tags. Agents that do not execute JavaScript see a page with no meaningful content.`,
    count: null
  };
}

function buildFinding002() {
  return {
    id: 'CONT-002',
    text: 'The page content is minimal and the HTML is dominated by script elements. Agents that do not execute JavaScript see little beyond the script tags themselves.',
    count: null
  };
}

function buildFinding003(titleValue) {
  return {
    id: 'CONT-003',
    text: `The page title is a default placeholder value ("${titleValue}"). Agents reading the page title to determine content purpose see only a template default.`,
    count: null
  };
}

function buildFinding004() {
  return {
    id: 'CONT-004',
    text: 'The page displays a noscript message requiring JavaScript to continue. Agents without JS execution receive only this message.',
    count: null
  };
}

function buildFinding005(count) {
  const noun = count === 1 ? 'heading element has' : 'heading elements have';
  const pronoun = count === 1 ? 'an empty entry' : 'empty entries';
  return {
    id: 'CONT-005',
    text: `${count} ${noun} no readable text content. Agents scanning headings to understand page structure find ${pronoun}.`,
    count
  };
}

function buildFinding006(count) {
  const noun = count === 1 ? 'anchor element contains' : 'anchor elements contain';
  return {
    id: 'CONT-006',
    text: `${count} ${noun} no text and no aria-label. Agents reading link destinations see only the URL, not the intent.`,
    count
  };
}
