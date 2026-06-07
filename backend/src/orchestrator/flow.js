/**
 * Perseus Clew: Deterministic scan flow.
 *
 * The pure core pipeline: parse HTML -> run 6 checks -> score ->
 * sanitize/escape findings -> assemble report. No I/O, no Bedrock,
 * no cache, no DynamoDB. Deterministic: same input always produces
 * the same output.
 *
 * The handler (index.js) calls this after fetching, and fills in
 * meta fields (requestId, resultId, timing, heroLine) afterwards.
 *
 * See BACKEND-FRONTEND-CHECKS.md section 8.
 */

import { parseHtml } from '../shared/parse-html.js';
import { sanitize, escapeHtml } from '../shared/sanitize.js';
import { checkSemanticHtml } from '../checks/frontend/semantic-html.js';
import { checkFormAccessibility } from '../checks/frontend/form-accessibility.js';
import { checkAria } from '../checks/frontend/aria.js';
import { checkStructuredData } from '../checks/frontend/structured-data.js';
import { checkContentHtml } from '../checks/frontend/content-html.js';
import { checkLinkNavigation } from '../checks/frontend/link-navigation.js';
import { calculateScore } from '../checks/frontend/scoring.js';

const METHODOLOGY_VERSION = '1.1.1';

/**
 * Run the deterministic scan pipeline.
 *
 * @param {string} html - Raw HTML fetched from the target
 * @param {string} targetUrl - The URL that was scanned
 * @param {object} [options] - Reserved (e.g. preScanFindings from handler)
 * @returns {object} The full report object (meta fields partially null for handler to fill)
 */
export function runScan(html, targetUrl, options = {}) {
  // 1. Parse
  const parsedHtml = parseHtml(html);

  // 2. Extract origin and domain from targetUrl
  let pageOrigin = null;
  let targetDomain = null;
  try {
    const parsed = new URL(targetUrl);
    pageOrigin = parsed.hostname.toLowerCase();
    targetDomain = parsed.hostname.toLowerCase();
  } catch {
    // If targetUrl is malformed, proceed without origin (link check falls back)
    targetDomain = targetUrl || 'unknown';
  }

  // 3. Run 6 checks (fixed order matching scoring category keys)
  const checkResults = {
    semantic_html: checkSemanticHtml(parsedHtml),
    form_accessibility: checkFormAccessibility(parsedHtml),
    aria: checkAria(parsedHtml),
    structured_data: checkStructuredData(parsedHtml),
    content_in_html: checkContentHtml(parsedHtml),
    link_navigation: checkLinkNavigation(parsedHtml, { pageOrigin })
  };

  // 4. Score (deterministic)
  const score = calculateScore(checkResults);

  // 5. Sanitize finding text, escape finding examples (clone to avoid mutating check outputs)
  const sanitizedFindings = {};
  for (const [category, result] of Object.entries(checkResults)) {
    sanitizedFindings[category] = result.findings.map(finding => {
      const cleaned = {
        id: finding.id,
        text: sanitize(finding.text),
        count: finding.count
      };
      if (finding.examples) {
        cleaned.examples = finding.examples.map(ex => escapeHtml(ex));
      }
      return cleaned;
    });
  }

  // 6. Assemble report
  return {
    meta: {
      requestId: null,
      resultId: null,
      scanType: 'url',
      targetDomain,
      durationMs: null,
      timestamp: null,
      scannedAt: null,
      fromCache: false,
      methodologyVersion: METHODOLOGY_VERSION
    },
    preScanFindings: options.preScanFindings || [],
    scoredViews: {
      rawHtml: {
        score: {
          total: score.total,
          rating: score.rating,
          breakdown: score.breakdown
        },
        heroLine: { text: '', source: 'pending', model: null },
        findings: sanitizedFindings
      }
    },
    simulation: { available: false }
  };
}
