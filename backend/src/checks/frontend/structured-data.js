/**
 * Perseus Clew: Structured Data check module.
 *
 * Examines whether the page declares what it is using structured data
 * formats (JSON-LD, Open Graph, Twitter Card) that agents can parse,
 * plus canonical URL and language declaration.
 *
 * See BACKEND-FRONTEND-CHECKS.md section 4.
 */

import { AppError } from '../../shared/errors.js';

const REQUIRED_OG_TAGS = ['og:title', 'og:description', 'og:type', 'og:image'];
const REQUIRED_TWITTER_TAGS = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];

/**
 * Run the structured data check against parsed HTML.
 *
 * @param {{ $: import('cheerio').CheerioAPI, metadata: object }} parsedHtml
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkStructuredData(parsedHtml) {
  try {
    const { $, metadata } = parsedHtml;
    let passed = 0;
    let total = 0;
    const findings = [];

    // Gather JSON-LD blocks
    const jsonLdBlocks = $('script[type="application/ld+json"]');
    const hasJsonLd = jsonLdBlocks.length > 0;

    // Sub-check 1: JSON-LD presence (SDATA-001) — always applicable
    total++;
    if (hasJsonLd) {
      passed++;
    } else {
      findings.push(buildFinding001());
    }

    // Sub-check 2: Valid JSON-LD parsing (SDATA-002) — only if blocks exist
    if (hasJsonLd) {
      total++;
      const invalidCount = countInvalidJsonLd($, jsonLdBlocks);
      if (invalidCount > 0) {
        findings.push(buildFinding002(invalidCount));
      } else {
        passed++;
      }
    }

    // Sub-check 3: Recognized @type (SDATA-003) — only if blocks exist
    if (hasJsonLd) {
      total++;
      const missingTypeCount = countMissingType($, jsonLdBlocks);
      if (missingTypeCount > 0) {
        findings.push(buildFinding003(missingTypeCount));
      } else {
        passed++;
      }
    }

    // Sub-check 4: Open Graph tags (SDATA-004) — always applicable
    total++;
    const missingOgCount = countMissingOg($);
    if (missingOgCount > 0) {
      findings.push(buildFinding004(missingOgCount));
    } else {
      passed++;
    }

    // Sub-check 5: Twitter Card (SDATA-005) — always applicable
    total++;
    const missingTwitterCount = countMissingTwitter($);
    if (missingTwitterCount > 0) {
      findings.push(buildFinding005(missingTwitterCount));
    } else {
      passed++;
    }

    // Sub-check 6: Canonical URL (SDATA-006) — always applicable
    total++;
    if (hasCanonical($)) {
      passed++;
    } else {
      findings.push(buildFinding006());
    }

    // Sub-check 7: Page language (SDATA-007) — always applicable
    total++;
    if (metadata.lang && metadata.lang.trim()) {
      passed++;
    } else {
      findings.push(buildFinding007());
    }

    return { passed, total, findings };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'CHECK_MODULE_ERROR',
      'The structured data check module encountered an internal error.',
      { originalError: error.message }
    );
  }
}

// --- Check 2: Valid JSON-LD parsing ---

function countInvalidJsonLd($, blocks) {
  let invalidCount = 0;
  blocks.each((_, el) => {
    const content = $(el).html() || '';
    try {
      JSON.parse(content);
    } catch {
      invalidCount++;
    }
  });
  return invalidCount;
}

// --- Check 3: @type presence ---

function countMissingType($, blocks) {
  let missingCount = 0;
  blocks.each((_, el) => {
    const content = $(el).html() || '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Invalid JSON is handled by check 2; skip here
      return;
    }

    // Handle @graph arrays
    if (parsed && Array.isArray(parsed['@graph'])) {
      for (const item of parsed['@graph']) {
        if (!hasValidType(item)) {
          missingCount++;
        }
      }
    } else {
      if (!hasValidType(parsed)) {
        missingCount++;
      }
    }
  });
  return missingCount;
}

function hasValidType(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const type = obj['@type'] || obj['type'];
  if (typeof type === 'string' && type.trim().length > 0) return true;
  if (Array.isArray(type) && type.length > 0 && type.every(t => typeof t === 'string' && t.trim())) return true;
  return false;
}

// --- Check 4: Open Graph ---

function countMissingOg($) {
  let missing = 0;
  for (const tag of REQUIRED_OG_TAGS) {
    const el = $(`meta[property="${tag}"]`);
    if (el.length === 0 || !el.attr('content')?.trim()) {
      missing++;
    }
  }
  return missing;
}

// --- Check 5: Twitter Card ---

function countMissingTwitter($) {
  let missing = 0;
  for (const tag of REQUIRED_TWITTER_TAGS) {
    const el = $(`meta[name="${tag}"]`);
    if (el.length === 0 || !el.attr('content')?.trim()) {
      missing++;
    }
  }
  return missing;
}

// --- Check 6: Canonical URL ---

function hasCanonical($) {
  const el = $('link[rel="canonical"]');
  return el.length > 0 && !!el.attr('href')?.trim();
}

// --- Finding builders ---

function buildFinding001() {
  return {
    id: 'SDATA-001',
    text: 'No JSON-LD structured data is present on this page. Agents parsing structured declarations to identify the page type cannot determine what this page represents.',
    count: null
  };
}

function buildFinding002(count) {
  const noun = count === 1 ? 'JSON-LD block contains' : 'JSON-LD blocks contain';
  const pronoun = count === 1 ? 'this block' : 'these blocks';
  return {
    id: 'SDATA-002',
    text: `${count} ${noun} content that does not parse as valid JSON. Agents reading structured data from ${pronoun} cannot extract any declarations.`,
    count
  };
}

function buildFinding003(count) {
  const noun = count === 1 ? 'JSON-LD block has' : 'JSON-LD blocks have';
  const pronoun = count === 1 ? 'this block describes' : 'these blocks describe';
  return {
    id: 'SDATA-003',
    text: `${count} ${noun} no @type declaration. Agents parsing structured data cannot identify what entity ${pronoun}.`,
    count
  };
}

function buildFinding004(count) {
  const noun = count === 1
    ? 'Open Graph meta tag (og:title, og:description, og:type, or og:image) is absent'
    : 'Open Graph meta tags are absent';
  const pronoun = count === 1 ? 'this value' : 'these values';
  return {
    id: 'SDATA-004',
    text: `${count} ${noun}. Agents generating link previews or summaries of this page must infer ${pronoun} from the full HTML.`,
    count
  };
}

function buildFinding005(count) {
  const noun = count === 1 ? 'Twitter Card meta tag is absent' : 'Twitter Card meta tags are absent';
  return {
    id: 'SDATA-005',
    text: `${count} ${noun}. Agents generating card previews for this page on social platforms have incomplete metadata to work with.`,
    count
  };
}

function buildFinding006() {
  return {
    id: 'SDATA-006',
    text: 'No canonical URL is declared on this page. Agents determining the authoritative URL for this content have no declared value to use.',
    count: null
  };
}

function buildFinding007() {
  return {
    id: 'SDATA-007',
    text: 'The html element has no lang attribute. Agents determining language for translation or speech synthesis have no declared value to use.',
    count: null
  };
}
