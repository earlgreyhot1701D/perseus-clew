/**
 * Perseus Clew scan handler (Block 0: mock implementation).
 *
 * Returns a hardcoded mock report matching the v2 orchestrator response shape.
 * No real checks, no target fetch, no Bedrock calls.
 *
 * After responding, writes to ScanResults (24h TTL) and ScanCache (15m TTL)
 * via scan-store.js, fire-and-forget and fail-soft.
 *
 * See BACKEND-FRONTEND-CHECKS.md section 8 for the response shape.
 */

import crypto from 'node:crypto';
import { writeResult, writeCache } from '../shared/scan-store.js';
import { logger } from '../shared/logger.js';

/**
 * Build the mock report. Shape matches BACKEND-FRONTEND-CHECKS.md section 8
 * (v2 orchestrator response with render-mode context).
 *
 * Provisional shape: findings, simulation, and benchmark sections will be
 * refined when the real orchestrator is built in Blocks 1A-1F.
 */
function buildMockReport(target) {
  const resultId = crypto.randomUUID();
  const now = new Date();

  return {
    meta: {
      requestId: `block0-${crypto.randomUUID().slice(0, 8)}`,
      resultId,
      scanType: 'url',
      targetDomain: extractDomain(target),
      durationMs: 1842,
      timestamp: now.toISOString(),
      scannedAt: now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC',
      fromCache: false
    },
    preScanFindings: [
      { type: 'robots_txt', message: 'robots.txt allows automated access. No restrictions detected.' }
    ],
    scoredViews: {
      // Render-mode guardrail: MVP emits rawHtml only.
      // A future "rendered" mode can join without breaking this contract.
      rawHtml: {
        score: {
          total: 62,
          rating: 'Partially Ready',
          breakdown: {
            semantic_html: { earned: 18, max: 25, note: null },
            form_accessibility: { earned: 12, max: 20, note: null },
            aria: { earned: 9, max: 15, note: null },
            structured_data: { earned: 8, max: 15, note: null },
            content_in_html: { earned: 13, max: 15, note: null },
            link_navigation: { earned: 2, max: 10, note: null }
          }
        },
        heroLine: {
          text: 'An agent visiting this page can read your product descriptions, but cannot tell which button starts checkout.',
          source: 'template'
        },
        // Provisional: findings shape pending real check modules (Blocks 1C-1F)
        findings: {
          semantic_html: [
            { id: 'SEM-001', text: 'Three elements with click handlers use styled div tags instead of the button tag. Agents identifying buttons by tag name cannot find these.', count: 3, examples: [] }
          ],
          form_accessibility: [
            { id: 'FORM-001', text: 'Two input fields rely on placeholder text alone for labeling. Agents filling this form cannot reliably determine what these fields expect.', count: 2, examples: [] }
          ],
          aria: [
            { id: 'ARIA-001', text: 'One dropdown widget has no aria-expanded attribute. Agents tracking open and closed state cannot determine whether it is open.', count: 1, examples: [] }
          ],
          structured_data: [
            { id: 'SDATA-001', text: 'No JSON-LD structured data is present on this page. Agents parsing structured declarations to identify the page type cannot determine what this page represents.', count: null, examples: [] }
          ],
          content_in_html: [],
          link_navigation: [
            { id: 'LINK-001', text: 'Five anchor elements use href="#" as their destination. Agents following links for navigation arrive at no meaningful destination.', count: 5, examples: [] }
          ]
        }
      }
    },
    // Provisional: simulation and benchmark pending Blocks 1H and 1K
    simulation: { available: false, reason: 'Layer 2 simulation not enabled in Block 0' },
    benchmark: { available: false, reason: 'Benchmark data not yet populated' }
  };
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

export const handler = async (event) => {
  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'INVALID_JSON', message: 'Request body must be valid JSON' })
    };
  }

  const { type, target } = body;

  if (!type || !['url', 'repo', 'spec'].includes(type)) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'INVALID_TYPE', message: 'Scan type must be one of: url, repo, spec' })
    };
  }

  if (!target) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'MISSING_TARGET', message: 'A scan target is required' })
    };
  }

  // Build mock report (Block 0: no real scanning)
  const report = buildMockReport(target);

  logger.info('Scan completed', {
    requestId: report.meta.requestId,
    targetUrl: target,
    scanType: type,
    score: report.scoredViews.rawHtml.score.total
  });

  // Return the report immediately
  const response = {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(report)
  };

  // Fire-and-forget writes. Fail-soft is inside scan-store.js.
  const urlHash = crypto.createHash('sha256').update(report.meta.targetDomain).digest('hex');
  writeResult(
    report.meta.resultId,
    report.meta.targetDomain,
    report.scoredViews.rawHtml.score.total,
    report.scoredViews.rawHtml.score.rating,
    report.scoredViews.rawHtml.heroLine.text,
    report.scoredViews.rawHtml.score.breakdown
  );
  writeCache(urlHash, report.meta.targetDomain, report);

  return response;
};
