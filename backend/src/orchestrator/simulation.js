/**
 * Perseus Clew: Layer 2 Agent Simulation (frontend only at MVP).
 *
 * Sends summarized page HTML + Layer 1 findings to Bedrock with structured
 * tasks. The model attempts each task as an agent would and reports what
 * it could and couldn't do, linking failures back to Layer 1 finding IDs.
 *
 * This is the "flavor" layer: deterministic structure (Layer 1) + AI
 * reasoning (Layer 2). It fills the `simulation` field that flow.js
 * stubs as { available: false }.
 *
 * Fail-soft (L-HERO-1 family): every Bedrock failure path degrades to
 * { available: false, reason } with a WARN log. Never crashes the scan.
 *
 * Integration: called by the handler (scan.js) in PARALLEL with
 * generateHeroLine via Promise.all. Does not run inside flow.js
 * (which is purely deterministic, no I/O).
 *
 * L-BENCH-1: two Bedrock calls per scan (hero + simulation) doubles
 * token throughput. The benchmark batch must pace scans to avoid
 * Bedrock throttling under concurrency. Not a code concern here;
 * the rate-limit (1A) gates user-facing load.
 *
 * L-XSS-SIM-1 (STANDING REQUIREMENT): narrative and reasoning fields
 * are UNTRUSTED free-text model output. Whoever renders these in the
 * UI MUST escape on render (textContent, not innerHTML). Stored as raw
 * strings. The UI block cannot forget this.
 *
 * See BACKEND-API-CHECKS.md Layer 2, Block 1H proposal.
 */

import { invokeBedrock } from '../shared/bedrock-client.js';
import { logger } from '../shared/logger.js';

// --- Task library (v1: 3 frontend tasks) ---

const TASKS = [
  {
    taskId: 'SIM-FE-CTA',
    instruction: 'Locate the primary call-to-action on this page (the main action the page wants the user to take). Report the element tag, its text content, and whether it is a semantic interactive element (button or anchor).',
    linkedCategories: ['semantic_html', 'content_in_html']
  },
  {
    taskId: 'SIM-FE-PURPOSE',
    instruction: 'From this HTML alone (no JavaScript execution, no images rendered), determine what this page is for. What would an agent be able to understand about this page without rendering it?',
    linkedCategories: ['structured_data', 'semantic_html', 'content_in_html']
  },
  {
    taskId: 'SIM-FE-NAV',
    instruction: 'Identify the navigation structure of this page. Can you find a nav element? Where do links lead? Can you determine where this page sits in the site hierarchy?',
    linkedCategories: ['link_navigation', 'aria']
  }
];

// --- HTML summarization limits ---

const MAX_HTML_CHARS = 40_000; // ~10K tokens
const MAX_FINDINGS_IN_PROMPT = 8;

// Output token ceiling for the simulation response.
// The schema returns 3 tasks, each with narrative, reasoning, and linkedFindings.
// On content-rich pages the JSON for all three exceeds 800 tokens and the response
// truncates mid-object, which fails JSON.parse and forces a parse-error fallback.
// 2000 fits the full 3-task schema with headroom. Input stays bounded by
// MAX_HTML_CHARS above, so this does not unbound cost on complex sites.
const MAX_SIMULATION_TOKENS = 2000;

// Valid task IDs (module-level, derived from TASKS library)
const VALID_TASK_IDS = new Set(TASKS.map(t => t.taskId));

// --- System prompt (fixed, page content NEVER goes here) ---

const SYSTEM_PROMPT = `You are an AI agent examining raw HTML to determine what actions you could take on a page. You do not have JavaScript execution or browser rendering. You see only the HTML structure and text content.

For each task, report:
- outcome: "success" if you can fully complete it, "partial" if partially, "failure" if not at all
- narrative: one sentence describing what you found or couldn't find (agent perspective, present tense)
- linkedFindings: array of Layer 1 finding IDs (e.g. "SEM-001") that explain WHY you couldn't complete the task. Empty array if outcome is "success" or no relevant finding.
- reasoning: brief explanation of how you reached your conclusion

Rules for narrative text:
- Describe what the agent CAN or CANNOT do. Never suggest fixes.
- Never use judgment words: bad, poor, weak, failing, broken, wrong.
- Never use em dashes.
- Keep each narrative under 150 characters.

Return ONLY valid JSON matching the schema. No text outside the JSON object.`;

// --- Error code to reason mapping ---

const ERROR_CODE_TO_REASON = {
  BEDROCK_TIMEOUT: 'timeout',
  BEDROCK_THROTTLED: 'throttle',
  BEDROCK_UNAVAILABLE: 'bedrock-unavailable',
  BEDROCK_PROMPT_TOO_LONG: 'prompt-too-long',
  BEDROCK_INVALID_RESPONSE: 'invalid-response'
};

/**
 * Run the agent simulation against scanned HTML.
 *
 * @param {string} html - Raw HTML of the scanned page
 * @param {number} score - Layer 1 total score
 * @param {string} rating - Layer 1 rating band
 * @param {object} findings - Sanitized findings { category: [...] }
 * @param {string} domain - The scanned domain
 * @returns {Promise<object>} Simulation result (available:true with tasks, or available:false with reason)
 */
export async function runSimulation(html, score, rating, findings, domain) {
  try {
    const userPrompt = buildUserPrompt(html, score, rating, findings, domain);

    const result = await invokeBedrock(SYSTEM_PROMPT, userPrompt, {
      maxTokens: MAX_SIMULATION_TOKENS,
      temperature: 0.3
    });

    // Parse and validate the response
    const parsed = parseResponse(result.text);
    if (!parsed) {
      logger.warn('Simulation fallback: invalid response', {
        domain,
        reason: 'parse-error',
        rawLength: result.text?.length || 0
      });
      return notAvailable('parse-error');
    }

    // Validate and filter linked findings (reject hallucinated IDs)
    const validFindingIds = collectValidFindingIds(findings);
    const validatedTasks = validateTasks(parsed.tasks, validFindingIds);

    if (validatedTasks.length === 0) {
      logger.warn('Simulation fallback: no valid tasks in response', {
        domain,
        reason: 'invalid-response'
      });
      return notAvailable('invalid-response');
    }

    return {
      available: true,
      tasks: validatedTasks,
      source: 'ai',
      model: result.modelId,
      durationMs: result.durationMs
    };
  } catch (error) {
    const reason = (error && error.code && ERROR_CODE_TO_REASON[error.code])
      || 'simulation-error';

    logger.warn('Simulation fallback: Bedrock error', {
      domain,
      reason,
      errorCode: error?.code || null,
      errorMessage: error?.message || null
    });

    return notAvailable(reason);
  }
}

// --- Prompt construction ---

function buildUserPrompt(html, score, rating, findings, domain) {
  const summarizedHtml = summarizeHtml(html);
  const findingLines = getTopFindings(findings, MAX_FINDINGS_IN_PROMPT);
  const taskInstructions = TASKS.map((t, i) =>
    `${i + 1}. ${t.taskId}: ${t.instruction}`
  ).join('\n');

  let prompt = `Page domain: ${domain}\nScore: ${score}/100 (${rating})\n\n`;

  if (findingLines.length > 0) {
    prompt += 'Layer 1 findings:\n';
    prompt += findingLines.map(f => `- ${f}`).join('\n');
    prompt += '\n\n';
  }

  prompt += `Page HTML (summarized):\n\`\`\`html\n${summarizedHtml}\n\`\`\`\n\n`;
  prompt += `Tasks:\n${taskInstructions}\n\n`;
  prompt += `Respond with JSON:\n{ "tasks": [{ "taskId": string, "outcome": "success"|"partial"|"failure", "narrative": string, "linkedFindings": string[], "reasoning": string }] }`;

  return prompt;
}

function getTopFindings(findings, limit) {
  const entries = Object.entries(findings || {});
  entries.sort((a, b) => b[1].length - a[1].length);

  const texts = [];
  for (const [, categoryFindings] of entries) {
    for (const finding of categoryFindings) {
      if (texts.length >= limit) break;
      if (finding.id && finding.text) {
        texts.push(`[${finding.id}] ${finding.text}`);
      }
    }
    if (texts.length >= limit) break;
  }
  return texts;
}

// --- HTML summarization ---

function summarizeHtml(html) {
  if (!html || typeof html !== 'string') return '';

  let summarized = html;

  // Strip script tags and contents
  summarized = summarized.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Strip style tags and contents
  summarized = summarized.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Strip HTML comments
  summarized = summarized.replace(/<!--[\s\S]*?-->/g, '');
  // Strip inline styles
  summarized = summarized.replace(/\s*style="[^"]*"/gi, '');
  // Strip data URIs
  summarized = summarized.replace(/data:[^"'\s]+/g, 'data:...');
  // Strip SVG path data (long d= attributes)
  summarized = summarized.replace(/\sd="[^"]{100,}"/g, ' d="..."');
  // Collapse excessive whitespace
  summarized = summarized.replace(/\s{3,}/g, '  ');

  // Cap at limit
  if (summarized.length > MAX_HTML_CHARS) {
    summarized = summarized.slice(0, MAX_HTML_CHARS) + '\n<!-- truncated -->';
  }

  return summarized;
}

// --- Response parsing and validation ---

function parseResponse(text) {
  if (!text || typeof text !== 'string') return null;

  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || !Array.isArray(parsed.tasks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function collectValidFindingIds(findings) {
  const ids = new Set();
  for (const categoryFindings of Object.values(findings || {})) {
    for (const finding of categoryFindings) {
      if (finding.id) ids.add(finding.id);
    }
  }
  return ids;
}

function validateTasks(tasks, validFindingIds) {
  if (!Array.isArray(tasks)) return [];

  const validated = [];
  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    if (!task.taskId || typeof task.taskId !== 'string') continue;

    // Reject hallucinated task IDs (same discipline as linkedFindings validation)
    if (!VALID_TASK_IDS.has(task.taskId)) continue;

    const outcome = task.outcome;
    if (!['success', 'partial', 'failure'].includes(outcome)) continue;

    // Strip hallucinated finding IDs (L-XSS-SIM-1: IDs are safe strings, but validate anyway)
    const linkedFindings = Array.isArray(task.linkedFindings)
      ? task.linkedFindings.filter(id => typeof id === 'string' && validFindingIds.has(id))
      : [];

    validated.push({
      taskId: task.taskId,
      outcome,
      // L-XSS-SIM-1: narrative and reasoning are UNTRUSTED model output.
      // Stored as raw strings. UI MUST escape on render (textContent, not innerHTML).
      narrative: typeof task.narrative === 'string' ? task.narrative.slice(0, 200) : '',
      linkedFindings,
      reasoning: typeof task.reasoning === 'string' ? task.reasoning.slice(0, 500) : ''
    });
  }

  return validated;
}

// --- Helpers ---

function notAvailable(reason) {
  return { available: false, reason };
}
