/**
 * Perseus Clew: Link & Navigation check module.
 *
 * Examines whether links on the page are real, navigable, and descriptive.
 * Agents traverse sites via the <a href> pattern. Links that don't work
 * as links or can't be understood from their text break agent navigation.
 *
 * See BACKEND-FRONTEND-CHECKS.md section 6.
 */

import { AppError } from '../../shared/errors.js';

const PLACEHOLDER_HREFS = new Set([
  '#',
  'javascript:void(0)',
  'javascript:void(0);',
  'javascript:;',
  'javascript:',
  ''
]);

const GENERIC_PHRASES = new Set([
  'click here',
  'here',
  'link',
  'read more',
  'more',
  'learn more',
  'this',
  'details',
  'go',
  'continue'
]);

/**
 * Run the link & navigation check against parsed HTML.
 *
 * @param {{ $: import('cheerio').CheerioAPI, metadata: object }} parsedHtml
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkLinkNavigation(parsedHtml, options = {}) {
  try {
    const { $ } = parsedHtml;
    const { pageOrigin } = options;
    let passed = 0;
    let total = 0;
    const findings = [];

    const anchors = $('a');
    const hasAnchors = anchors.length > 0;
    const hasNav = $('nav').length > 0;
    const hasNavigation = hasNav || anchors.length >= 2;

    // Sub-check 1: Anchors have href (LINK-001) — only if anchors exist
    if (hasAnchors) {
      total++;
      const hreflessCount = countHrefless($, anchors);
      if (hreflessCount > 0) {
        findings.push(buildFinding001(hreflessCount));
      } else {
        passed++;
      }
    }

    // Sub-check 2: href is meaningful (LINK-002) — only if anchors exist
    if (hasAnchors) {
      total++;
      const placeholderCount = countPlaceholderHrefs($, anchors);
      if (placeholderCount > 0) {
        findings.push(buildFinding002(placeholderCount));
      } else {
        passed++;
      }
    }

    // Sub-check 3: Link text is descriptive (LINK-003) — only if anchors with text exist
    if (hasAnchors) {
      const genericCount = countGenericText($, anchors);
      if (genericCount.applicable) {
        total++;
        if (genericCount.count > 0) {
          findings.push(buildFinding003(genericCount.count));
        } else {
          passed++;
        }
      }
    }

    // Sub-check 4: External links distinguishable (LINK-004) — only if origin determinable
    if (hasAnchors) {
      const externals = checkExternalLinks($, anchors, pageOrigin);
      if (externals.applicable) {
        total++;
        if (externals.count > 0) {
          findings.push(buildFinding004(externals.count));
        } else {
          passed++;
        }
      }
    }

    // Sub-check 5: Skip-to-content link (LINK-005) — only if navigation worth skipping
    if (hasNavigation) {
      total++;
      if (hasSkipLink($)) {
        passed++;
      } else {
        findings.push(buildFinding005());
      }
    }

    // Sub-check 6: Duplicate link text (LINK-006) — only if anchors exist
    if (hasAnchors) {
      const dupes = countDuplicateTextGroups($, anchors);
      if (dupes.applicable) {
        total++;
        if (dupes.count > 0) {
          findings.push(buildFinding006(dupes.count));
        } else {
          passed++;
        }
      }
    }

    return { passed, total, findings };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'CHECK_MODULE_ERROR',
      'The link navigation check module encountered an internal error.',
      { originalError: error.message }
    );
  }
}

// --- Check 1: Hrefless anchors ---

function countHrefless($, anchors) {
  let count = 0;
  anchors.each((_, el) => {
    const href = $(el).attr('href');
    if (href === undefined || href === null) {
      count++;
    }
  });
  return count;
}

// --- Check 2: Placeholder hrefs ---

function countPlaceholderHrefs($, anchors) {
  let count = 0;
  anchors.each((_, el) => {
    const href = $(el).attr('href');
    if (href === undefined || href === null) return; // handled by check 1
    if (PLACEHOLDER_HREFS.has(href.trim().toLowerCase())) {
      count++;
    }
  });
  return count;
}

// --- Check 3: Generic link text ---

function countGenericText($, anchors) {
  let count = 0;
  let hasTextAnchors = false;

  anchors.each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (!text) return; // textless anchors are module 5's CONT-006 territory

    hasTextAnchors = true;

    // Check if entire text is a generic phrase
    if (!GENERIC_PHRASES.has(text.toLowerCase())) return;

    // Has disambiguating context (aria-label or title)?
    if ($el.attr('aria-label') || $el.attr('title')) return;

    count++;
  });

  return { applicable: hasTextAnchors, count };
}

// --- Check 4: External links without rel ---

function checkExternalLinks($, anchors, pageOrigin) {
  // Determine page origin: prefer passed origin, fall back to canonical/base
  const origin = pageOrigin || getPageOrigin($);
  if (!origin) {
    return { applicable: false, count: 0 };
  }

  let count = 0;
  let hasExternals = false;

  anchors.each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href.startsWith('http://') && !href.startsWith('https://')) return;

    let linkHost;
    try {
      linkHost = new URL(href).hostname.toLowerCase();
    } catch {
      return; // malformed URL, skip
    }

    if (linkHost === origin) return; // internal

    hasExternals = true;
    const rel = $(el).attr('rel');
    if (!rel) {
      count++;
    }
  });

  return { applicable: hasExternals, count };
}

function getPageOrigin($) {
  // Try canonical first
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) {
    try {
      return new URL(canonical).hostname.toLowerCase();
    } catch {
      // fall through
    }
  }

  // Try base href
  const base = $('base').attr('href');
  if (base) {
    try {
      return new URL(base).hostname.toLowerCase();
    } catch {
      // fall through
    }
  }

  return null;
}

// --- Check 5: Skip-to-content link ---

function hasSkipLink($) {
  // Look in the first several elements of body for a skip link
  const bodyChildren = $('body').children();
  const searchLimit = Math.min(bodyChildren.length, 5);

  for (let i = 0; i < searchLimit; i++) {
    const el = bodyChildren.eq(i);

    // Check if this element IS a skip link
    if (isSkipLink($, el)) return true;

    // Check if it CONTAINS a skip link (e.g., inside a wrapper div)
    const innerLink = el.find('a').first();
    if (innerLink.length > 0 && isSkipLink($, innerLink)) return true;
  }

  return false;
}

function isSkipLink($, $el) {
  if (!$el.is('a')) return false;
  const href = ($el.attr('href') || '');
  if (!href.startsWith('#')) return false;
  const text = $el.text().toLowerCase();
  return text.includes('skip');
}

// --- Check 6: Duplicate link text with different destinations ---

function countDuplicateTextGroups($, anchors) {
  const textToHrefs = {};
  let hasGroupableLinks = false;

  anchors.each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim().toLowerCase();
    if (!text) return; // skip textless

    const href = ($el.attr('href') || '').trim();
    if (!href || PLACEHOLDER_HREFS.has(href.toLowerCase())) return; // skip placeholder hrefs

    // If anchor has aria-label, it's disambiguated — skip
    if ($el.attr('aria-label')) return;

    hasGroupableLinks = true;

    const normalizedHref = normalizeHref(href);
    if (!textToHrefs[text]) textToHrefs[text] = new Set();
    textToHrefs[text].add(normalizedHref);
  });

  // Count groups with 2+ distinct destinations
  let conflictGroups = 0;
  for (const text of Object.keys(textToHrefs)) {
    if (textToHrefs[text].size >= 2) {
      conflictGroups++;
    }
  }

  return { applicable: hasGroupableLinks, count: conflictGroups };
}

function normalizeHref(href) {
  return href.trim().toLowerCase().replace(/\/+$/, '');
}

// --- Finding builders ---

function buildFinding001(count) {
  const noun = count === 1 ? 'anchor element has' : 'anchor elements have';
  const pronoun = count === 1 ? 'this element' : 'these elements';
  return {
    id: 'LINK-001',
    text: `${count} ${noun} no href attribute. Agents traversing the site via links cannot navigate from ${pronoun}.`,
    count
  };
}

function buildFinding002(count) {
  const noun = count === 1 ? 'anchor element uses a placeholder href' : 'anchor elements use placeholder hrefs';
  const pronoun = count === 1 ? 'this link' : 'these links';
  return {
    id: 'LINK-002',
    text: `${count} ${noun} (such as "#" or "javascript:void(0)"). Agents following ${pronoun} for navigation arrive at no meaningful destination.`,
    count
  };
}

function buildFinding003(count) {
  const noun = count === 1 ? 'link uses generic text' : 'links use generic text';
  const possessive = count === 1 ? 'its' : 'their';
  const pronoun = count === 1 ? 'this link leads' : 'these links lead';
  return {
    id: 'LINK-003',
    text: `${count} ${noun} (such as "click here" or "read more") as ${possessive} entire accessible name with no additional context. Agents parsing link intent from text alone cannot determine where ${pronoun}.`,
    count
  };
}

function buildFinding004(count) {
  const noun = count === 1 ? 'link to an external domain has' : 'links to external domains have';
  const pronoun = count === 1 ? 'this link' : 'these links';
  return {
    id: 'LINK-004',
    text: `${count} ${noun} no rel attribute. Agents distinguishing internal from external navigation cannot identify ${pronoun} as leading off-site.`,
    count
  };
}

function buildFinding005() {
  return {
    id: 'LINK-005',
    text: 'No skip-to-content link is present near the top of the page. Agents and keyboard users bypassing navigation to reach main content have no shortcut.',
    count: null
  };
}

function buildFinding006(count) {
  const noun = count === 1 ? 'group of links shares' : 'groups of links share';
  const verb = count === 1 ? 'points' : 'point';
  const pronoun = count === 1 ? 'each instance leads' : 'each instance leads';
  return {
    id: 'LINK-006',
    text: `${count} ${noun} identical text but ${verb} to different destinations. Agents distinguishing links by text alone cannot determine where ${pronoun}.`,
    count
  };
}
