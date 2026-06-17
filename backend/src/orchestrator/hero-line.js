/**
 * Perseus Clew: Hero narrative line generator.
 *
 * Generates a one-sentence summary of what an agent experiences on the
 * scanned page. Uses Bedrock (Claude Haiku 4.5) with a deterministic
 * template fallback. Fail-soft, never fail-silent: every fallback logs
 * a WARN with the reason.
 *
 * See BACKEND-FRONTEND-CHECKS.md section 8 (heroLine shape).
 */

import { invokeBedrock } from '../shared/bedrock-client.js';
import { logger } from '../shared/logger.js';

// --- Banned-set (single source of truth for system prompt AND validation) ---

const BANNED_JUDGMENT = ['bad', 'poor', 'weak', 'failing', 'broken', 'wrong', 'incorrect'];
const BANNED_PRESCRIPTION = ['should', 'need to', 'fix', 'must', 'recommend'];
const BANNED_SEVERITY = ['critical', 'serious', 'minor'];
const BANNED_BLAME = ['you forgot', 'you missed'];
const BANNED_CLICHES = ['delve', 'landscape', 'straightforward', 'genuinely', 'honestly'];

const ALL_BANNED_WORDS = [
  ...BANNED_JUDGMENT,
  ...BANNED_PRESCRIPTION,
  ...BANNED_SEVERITY,
  ...BANNED_BLAME,
  ...BANNED_CLICHES
];

// Build word-boundary regex from the banned set (case-insensitive)
const BANNED_REGEX = new RegExp(
  '\\b(' + ALL_BANNED_WORDS.map(w => w.replace(/\s+/g, '\\s+')).join('|') + ')\\b',
  'i'
);

// Em dash detection (U+2014)
const EM_DASH_RE = /\u2014/;

// --- Error code to reason mapping (Amendment 1) ---

const ERROR_CODE_TO_REASON = {
  BEDROCK_TIMEOUT: 'timeout',
  BEDROCK_THROTTLED: 'throttle',
  BEDROCK_UNAVAILABLE: 'bedrock-unavailable',
  BEDROCK_PROMPT_TOO_LONG: 'prompt-too-long',
  BEDROCK_INVALID_RESPONSE: 'bedrock-invalid-response'
};

// --- System prompt ---

const SYSTEM_PROMPT = `You write one-sentence summaries for Agentis Lux, an agent-readiness scanner.

HARD CONSTRAINTS (violating any one makes your output unusable):
1. EXACTLY one sentence. No line breaks.
2. MAXIMUM 160 characters total. Count carefully. Shorter is fine.
3. No em dashes. Use commas or periods only.
4. No markdown, no quotes, no labels. Output the bare sentence only.

CONTENT:
- Describe what a web agent CAN and CANNOT do on this page.
- Present tense. Lead with what works, then what does not.
- Name the domain once, at the start: "An agent visiting {domain}..."
- Pick ONE or TWO observations, not an exhaustive list.

BANNED WORDS (never use): ${ALL_BANNED_WORDS.join(', ')}.

EXAMPLE (130 chars): "An agent visiting example.com can read article text and follow nav links, but cannot identify the search input by its label."`;

// --- Deterministic templates ---

const TEMPLATES = {
  'Agent-Ready': 'An agent visiting {domain} can identify interactive elements, read content, and navigate links on this page.',
  'Partially Ready': 'An agent visiting {domain} can read some content on this page, but encounters elements it cannot interpret or navigate.',
  'Not Yet Readable': 'An agent visiting {domain} finds little readable content or navigable structure on this page.'
};

/**
 * Generate the hero narrative line.
 *
 * @param {number} score - Total score 0-100
 * @param {string} rating - 'Agent-Ready' | 'Partially Ready' | 'Not Yet Readable'
 * @param {object} findings - Sanitized findings { category: [...] }
 * @param {string} domain - The scanned domain
 * @returns {Promise<{text: string, source: 'ai'|'template', model: string|null}>}
 */
export async function generateHeroLine(score, rating, findings, domain) {
  try {
    const userPrompt = buildUserPrompt(score, rating, findings, domain);
    const result = await invokeBedrock(SYSTEM_PROMPT, userPrompt, {
      maxTokens: 100,
      temperature: 0.4
    });

    // Strip wrapping quotes and whitespace (Amendment 3)
    const cleaned = stripWrappingQuotes(result.text.trim());

    // Validate the response (Amendment 2/4)
    const validationFailure = validateResponse(cleaned);
    if (validationFailure) {
      logger.warn('Hero line fallback to template', {
        reason: validationFailure,
        domain,
        score,
        rating,
        rawResponse: cleaned.slice(0, 200)
      });
      return buildTemplateResult(rating, domain);
    }

    return {
      text: cleaned,
      source: 'ai',
      model: result.modelId
    };
  } catch (error) {
    // Map error code to reason
    const reason = (error && error.code && ERROR_CODE_TO_REASON[error.code])
      || 'bedrock-error';

    logger.warn('Hero line fallback to template', {
      reason,
      domain,
      score,
      rating,
      errorCode: error?.code || null,
      errorMessage: error?.message || null
    });

    return buildTemplateResult(rating, domain);
  }
}

// --- Prompt construction ---

function buildUserPrompt(score, rating, findings, domain) {
  const topFindings = getTopFindings(findings, 5);

  if (topFindings.length === 0) {
    return `Domain: ${domain}\nScore: ${score}/100 (${rating})\n\nNo findings. The agent can navigate and understand this page fully.`;
  }

  const findingLines = topFindings.map(f => `- ${f}`).join('\n');
  return `Domain: ${domain}\nScore: ${score}/100 (${rating})\n\nTop findings (what the agent cannot do):\n${findingLines}`;
}

function getTopFindings(findings, limit) {
  // Collect all finding .text values, sorted by category with most findings first
  const entries = Object.entries(findings || {});
  entries.sort((a, b) => b[1].length - a[1].length);

  const texts = [];
  for (const [, categoryFindings] of entries) {
    for (const finding of categoryFindings) {
      if (texts.length >= limit) break;
      // Only use .text (plain language), never .examples (may contain escaped HTML)
      if (finding.text) {
        texts.push(finding.text);
      }
    }
    if (texts.length >= limit) break;
  }
  return texts;
}

// --- Response processing ---

function stripWrappingQuotes(text) {
  // Strip leading/trailing single or double quotes
  let result = text;
  if ((result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function validateResponse(text) {
  // Empty
  if (!text || text.length === 0) {
    return 'empty-response';
  }

  // Too long (> 200 chars after cleaning)
  if (text.length > 200) {
    return 'too-long';
  }

  // Multi-line
  if (text.includes('\n')) {
    return 'multi-line-response';
  }

  // Markdown prefix (check trimmed text, Amendment 4)
  if (/^[#\-*>]/.test(text) || text.includes('**') || text.includes('`')) {
    return 'markdown-in-response';
  }

  // Em dash
  if (EM_DASH_RE.test(text)) {
    return 'voice-violation-em-dash';
  }

  // Banned words (word-boundary, case-insensitive, Amendment 2)
  if (BANNED_REGEX.test(text)) {
    return 'voice-violation';
  }

  return null; // passes validation
}

// --- Template fallback ---

function buildTemplateResult(rating, domain) {
  const template = TEMPLATES[rating] || TEMPLATES['Partially Ready'];
  const text = template.replace('{domain}', domain || 'this page');
  return { text, source: 'template', model: null };
}
