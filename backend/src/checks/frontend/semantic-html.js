/**
 * Perseus Clew: Semantic HTML check module.
 *
 * Examines whether interactive elements use semantic HTML tags
 * rather than styled div/span elements with click handlers.
 * Agents identify elements by tag name; non-semantic elements
 * are invisible to most agents as interactive controls.
 *
 * See BACKEND-FRONTEND-CHECKS.md section 1.
 */

import { AppError } from '../../shared/errors.js';

/**
 * Run the semantic HTML check against parsed HTML.
 *
 * @param {{ $: import('cheerio').CheerioAPI, metadata: object }} parsedHtml
 * @returns {{ passed: number, total: number, findings: Array }}
 */
export function checkSemanticHtml(parsedHtml) {
  try {
    const { $ } = parsedHtml;
    let passed = 0;
    let total = 0;
    const findings = [];

    // Sub-check 1: Clickable div/span elements (SEM-001)
    const clickableResult = checkClickableDivSpan($);
    total++;
    if (clickableResult) {
      findings.push(clickableResult);
    } else {
      passed++;
    }

    // Sub-check 2: Presence of <nav> (SEM-002)
    const navResult = checkNavPresence($);
    total++;
    if (navResult) {
      findings.push(navResult);
    } else {
      passed++;
    }

    // Sub-check 3: Exactly one <main> (SEM-003)
    const mainResult = checkMainLandmark($);
    total++;
    if (mainResult) {
      findings.push(mainResult);
    } else {
      passed++;
    }

    // Sub-check 4: Heading hierarchy (SEM-004)
    const headingResult = checkHeadingHierarchy($);
    total++;
    if (headingResult) {
      findings.push(headingResult);
    } else {
      passed++;
    }

    // Sub-check 5: List structure (SEM-005)
    const listResult = checkListStructure($);
    total++;
    if (listResult) {
      findings.push(listResult);
    } else {
      passed++;
    }

    // Sub-check 6: Form wrapper (SEM-006)
    const formResult = checkFormWrapper($);
    total++;
    if (formResult) {
      findings.push(formResult);
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
      'The semantic HTML check module encountered an internal error.',
      { originalError: error.message }
    );
  }
}

/**
 * Sub-check 1: Clickable div/span elements that should be buttons.
 * @returns {object|null} Finding or null if passed.
 */
function checkClickableDivSpan($) {
  const selector = [
    'div[onclick]', 'div[onClick]', 'div[onpress]', 'div[onPress]',
    'div[onkeydown]', 'div[onKeyDown]', 'div[onkeyup]', 'div[onKeyUp]',
    'div[role="button"]',
    'span[onclick]', 'span[onClick]', 'span[onpress]', 'span[onPress]',
    'span[onkeydown]', 'span[onKeyDown]', 'span[onkeyup]', 'span[onKeyUp]',
    'span[role="button"]'
  ].join(', ');

  const elements = $(selector);
  const count = elements.length;

  if (count === 0) {
    return null;
  }

  const examples = [];
  elements.each((i, el) => {
    if (examples.length < 3) {
      let snippet = $.html(el);
      if (snippet.length > 80) {
        snippet = snippet.slice(0, 77) + '...';
      }
      examples.push(snippet);
    }
  });

  const noun = count === 1 ? 'element' : 'elements';
  const verb = count === 1 ? 'uses' : 'use';
  return {
    id: 'SEM-001',
    text: `${count} ${noun} with click handlers ${verb} styled div or span tags instead of the button tag. Agents identifying buttons by tag name cannot find these.`,
    count,
    examples
  };
}

/**
 * Sub-check 2: Presence of at least one <nav> element.
 * @returns {object|null} Finding or null if passed.
 */
function checkNavPresence($) {
  if ($('nav').length >= 1) {
    return null;
  }

  return {
    id: 'SEM-002',
    text: 'The page has no nav element. Agents scanning for navigation landmarks cannot identify the site navigation.',
    count: null
  };
}

/**
 * Sub-check 3: Exactly one <main> landmark.
 * @returns {object|null} Finding or null if passed.
 */
function checkMainLandmark($) {
  const mainCount = $('main').length;

  if (mainCount === 1) {
    return null;
  }

  if (mainCount === 0) {
    return {
      id: 'SEM-003',
      text: 'The page has no main landmark. Agents scanning for the main content region cannot locate the primary area.',
      count: null
    };
  }

  return {
    id: 'SEM-003',
    text: `${mainCount} main landmarks are present. Agents expect exactly one main content region and cannot determine which is primary.`,
    count: mainCount
  };
}

/**
 * Sub-check 4: Heading hierarchy (one h1, no skipped levels).
 * @returns {object|null} Finding or null if passed.
 */
function checkHeadingHierarchy($) {
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = el.tagName || el.name;
    const level = parseInt(tag.charAt(1), 10);
    headings.push(level);
  });

  if (headings.length === 0) {
    return {
      id: 'SEM-004',
      text: 'The page has no heading elements. Agents reading heading structure to build a page outline find no hierarchy.',
      count: null
    };
  }

  const issues = [];

  // Check for exactly one h1
  const h1Count = headings.filter(l => l === 1).length;
  if (h1Count === 0) {
    issues.push('no h1 element is present');
  } else if (h1Count > 1) {
    issues.push(`${h1Count} h1 elements are present instead of one`);
  }

  // Check for skipped levels
  let skipCount = 0;
  const skipExamples = [];
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1];
    const curr = headings[i];
    if (curr > prev + 1) {
      skipCount++;
      if (skipExamples.length < 3) {
        skipExamples.push(`h${prev} to h${curr}`);
      }
    }
  }

  if (skipCount > 0) {
    issues.push(`the hierarchy skips levels (${skipExamples.join(', ')})`);
  }

  if (issues.length === 0) {
    return null;
  }

  const totalIssueCount = (h1Count === 0 || h1Count > 1 ? 1 : 0) + skipCount;

  let text;
  if (issues.length === 1 && skipCount > 0) {
    text = `The heading hierarchy skips levels (${skipExamples.join(', ')}). Agents reading heading structure to build an outline encounter ${skipCount === 1 ? 'a gap' : 'gaps'}.`;
  } else if (issues.length === 1 && h1Count === 0) {
    text = 'The page has no h1 element. Agents reading heading structure cannot identify the primary heading.';
  } else if (issues.length === 1 && h1Count > 1) {
    text = `${h1Count} h1 elements are present on the page. Agents expect one primary heading and cannot determine which is the page title.`;
  } else {
    text = `The heading structure has multiple issues: ${issues.join(', and ')}. Agents reading heading structure to build an outline encounter inconsistencies.`;
  }

  return {
    id: 'SEM-004',
    text,
    count: totalIssueCount > 0 ? totalIssueCount : null
  };
}

/**
 * Sub-check 5: List structure.
 * Flags parent elements with 3+ same-tag direct children (div/span only)
 * that have near-identical internal structure and are not inside proper
 * list containers. Biases toward missing a real list over flagging a fake one.
 *
 * @returns {object|null} Finding or null if passed.
 */
function checkListStructure($) {
  const EXCLUDED_PARENTS = new Set([
    'ul', 'ol', 'menu', 'dl', 'nav', 'table', 'thead', 'tbody', 'tfoot', 'select'
  ]);
  const EXCLUDED_ROLES = new Set([
    'list', 'listbox', 'grid', 'row', 'tablist', 'toolbar'
  ]);
  const CANDIDATE_TAGS = new Set(['div', 'span']);

  let looseListCount = 0;

  $('*').each((_, parentEl) => {
    const parentTag = (parentEl.tagName || parentEl.name || '').toLowerCase();

    if (EXCLUDED_PARENTS.has(parentTag)) return;

    const role = $(parentEl).attr('role');
    if (role && EXCLUDED_ROLES.has(role.toLowerCase())) return;

    const children = $(parentEl).children();
    if (children.length < 3) return;

    const tagGroups = {};
    children.each((__, child) => {
      const childTag = (child.tagName || child.name || '').toLowerCase();
      if (CANDIDATE_TAGS.has(childTag)) {
        if (!tagGroups[childTag]) tagGroups[childTag] = [];
        tagGroups[childTag].push(child);
      }
    });

    for (const tag of Object.keys(tagGroups)) {
      const group = tagGroups[tag];
      if (group.length < 3) continue;

      if (hasIdenticalStructure($, group)) {
        looseListCount++;
      }
    }
  });

  if (looseListCount === 0) {
    return null;
  }

  const noun = looseListCount === 1 ? 'group' : 'groups';
  return {
    id: 'SEM-005',
    text: `${looseListCount} ${noun} of repeated sibling elements appear to be lists but are not wrapped in ul or ol with li elements. Agents parsing list structures cannot identify these as lists.`,
    count: looseListCount
  };
}

/**
 * Determine if a group of elements has near-identical internal structure.
 * "Identical structure" means same child tag sequence for all items.
 * Biases conservative: if any ambiguity, returns false (no finding).
 */
function hasIdenticalStructure($, elements) {
  if (elements.length < 3) return false;

  const structures = elements.map(el => {
    const children = $(el).children();
    const tagSequence = [];
    children.each((_, child) => {
      tagSequence.push((child.tagName || child.name || '').toLowerCase());
    });
    return tagSequence.join(',');
  });

  const firstStructure = structures[0];

  // Empty internals (leaf divs with only text) are ambiguous; don't flag
  if (!firstStructure) return false;

  return structures.every(s => s === firstStructure);
}

/**
 * Sub-check 6: Form wrapper (inputs/selects inside <form>).
 * @returns {object|null} Finding or null if passed.
 */
function checkFormWrapper($) {
  const formControls = $('input, select, textarea');

  if (formControls.length === 0) {
    // No form controls on the page; pass (nothing to check for this sub-check).
    return null;
  }

  let outsideCount = 0;
  formControls.each((_, el) => {
    if ($(el).closest('form').length === 0) {
      outsideCount++;
    }
  });

  if (outsideCount === 0) {
    return null;
  }

  const noun = outsideCount === 1 ? 'input element appears' : 'input elements appear';
  return {
    id: 'SEM-006',
    text: `${outsideCount} ${noun} outside any form wrapper. An agent identifying forms by the form tag misses these inputs.`,
    count: outsideCount
  };
}
