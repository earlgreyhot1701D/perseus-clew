/**
 * Perseus Clew: Benchmark batch runner.
 *
 * Iterates all 50 benchmark sites, invokes the scan path per site,
 * and writes results to DynamoDB (PerseusClew-BenchmarkScans).
 *
 * Orchestration only. Does NOT modify the scan engine, checks, scorers,
 * or flows. Calls them as a consumer.
 *
 * Concurrency: 3 sites in parallel, 2s delay between batches.
 * Per-site isolation: one failure never kills the batch.
 *
 * See docs/BENCHMARK-SITES.md, docs/BENCHMARK-HYPOTHESES.md.
 */

import { BENCHMARK_SITES } from './sites.js';
import { fetchSpecUrl } from './fetch-spec-url.js';
import { fetchUrl } from '../shared/fetch-url.js';
import { runScan } from '../orchestrator/flow.js';
import { runApiScan } from '../orchestrator/api-flow.js';
import { generateHeroLine } from '../orchestrator/hero-line.js';
import { runSimulation } from '../orchestrator/simulation.js';
import { logger } from '../shared/logger.js';
import { writeBenchmarkResult } from './benchmark-store.js';

const CONCURRENCY = parseInt(process.env.BENCHMARK_CONCURRENCY, 10) || 3;
const INTER_BATCH_DELAY_MS = parseInt(process.env.BENCHMARK_DELAY_MS, 10) || 2000;
const METHODOLOGY_VERSION = '1.1.1';

// Injected sleep for testability
let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Test-only: override the sleep function.
 */
export function _setSleep(fn) {
  sleep = fn;
}

/**
 * Extract domain from a URL (for logging; never logs full URL).
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
}

/**
 * Run the door scan for a single site (frontend flow + Bedrock enrichment).
 *
 * @param {object} site - Site entry from BENCHMARK_SITES
 * @param {string} batchRunId - Ties all results to one invocation
 * @returns {Promise<object>} The benchmark result record
 */
async function runDoorScan(site, batchRunId) {
  const startTime = Date.now();
  const domain = extractDomain(site.url);
  const scanDate = new Date().toISOString().slice(0, 10);
  const scanTimestamp = `door#${new Date().toISOString()}`;

  try {
    // 1. Fetch HTML
    const { html } = await fetchUrl(site.url);

    // 2. Run deterministic frontend scan
    const report = runScan(html, site.url);

    // 3. Bedrock enrichment (parallel, fail-soft)
    const [heroLine, simulation] = await Promise.all([
      generateHeroLine(
        report.scoredViews.rawHtml.score.total,
        report.scoredViews.rawHtml.score.rating,
        report.scoredViews.rawHtml.findings,
        domain
      ).catch((err) => {
        logger.warn('Benchmark hero-line fallback', {
          siteId: site.siteId,
          domain,
          reason: err?.code || err?.message || 'unknown'
        });
        return { text: '', source: 'template', model: null, _fallback: true };
      }),
      runSimulation(
        html,
        report.scoredViews.rawHtml.score.total,
        report.scoredViews.rawHtml.score.rating,
        report.scoredViews.rawHtml.findings,
        domain
      ).catch((err) => {
        logger.warn('Benchmark simulation fallback', {
          siteId: site.siteId,
          domain,
          reason: err?.code || err?.message || 'unknown'
        });
        return { available: false, reason: 'simulation-error', _fallback: true };
      })
    ]);

    // Count Bedrock fallbacks for the run summary
    let bedrockFallbacks = 0;
    if (heroLine._fallback) bedrockFallbacks++;
    if (simulation._fallback) bedrockFallbacks++;

    // Strip internal _fallback marker before persisting
    const { _fallback: _hf, ...cleanHeroLine } = heroLine; // eslint-disable-line no-unused-vars
    const { _fallback: _sf, ...cleanSimulation } = simulation; // eslint-disable-line no-unused-vars

    const durationMs = Date.now() - startTime;

    return {
      siteId: site.siteId,
      scanTimestamp,
      vertical: site.vertical,
      scanDate,
      scanMode: 'door',
      status: 'success',
      failureReason: null,
      failureMessage: null,
      frontendScore: report.scoredViews.rawHtml.score.total,
      frontendRating: report.scoredViews.rawHtml.score.rating,
      frontendBreakdown: report.scoredViews.rawHtml.score.breakdown,
      findings: report.scoredViews.rawHtml.findings,
      findingsCount: Object.values(report.scoredViews.rawHtml.findings)
        .reduce((sum, arr) => sum + arr.length, 0),
      heroLine: cleanHeroLine,
      simulation: cleanSimulation,
      apiScore: null,
      apiRating: null,
      apiBreakdown: null,
      apiFindings: null,
      apiError: null,
      durationMs,
      methodologyVersion: METHODOLOGY_VERSION,
      batchRunId,
      _bedrockFallbacks: bedrockFallbacks
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;

    logger.warn('Benchmark door scan failed', {
      siteId: site.siteId,
      domain,
      errorCode: err?.code || null,
      errorMessage: err?.message || null
    });

    return {
      siteId: site.siteId,
      scanTimestamp,
      vertical: site.vertical,
      scanDate,
      scanMode: 'door',
      status: 'failed',
      failureReason: err?.code || 'UNKNOWN_ERROR',
      failureMessage: err?.message || 'An unexpected error occurred.',
      frontendScore: null,
      frontendRating: null,
      frontendBreakdown: null,
      findings: null,
      findingsCount: null,
      heroLine: null,
      simulation: null,
      apiScore: null,
      apiRating: null,
      apiBreakdown: null,
      apiFindings: null,
      apiError: null,
      durationMs,
      methodologyVersion: METHODOLOGY_VERSION,
      batchRunId
    };
  }
}

/**
 * Run the reference scan for a SaaS site (API flow only, no hero/simulation).
 *
 * @param {object} site - Site entry with referenceSpecUrl
 * @param {string} batchRunId - Ties all results to one invocation
 * @returns {Promise<object>} The benchmark result record
 */
async function runReferenceScan(site, batchRunId) {
  const startTime = Date.now();
  const scanDate = new Date().toISOString().slice(0, 10);
  const scanTimestamp = `reference#${new Date().toISOString()}`;

  try {
    // 1. Fetch spec text
    const { text: specText, contentType } = await fetchSpecUrl(site.referenceSpecUrl);

    // 2. Run API scan (returns one of 3 shapes)
    const result = await runApiScan(specText, contentType);

    const durationMs = Date.now() - startTime;

    // Shape 1: Error (parse failure)
    if (result.error === true) {
      return {
        siteId: site.siteId,
        scanTimestamp,
        vertical: site.vertical,
        scanDate,
        scanMode: 'reference',
        status: 'failed',
        failureReason: result.code,
        failureMessage: result.message,
        frontendScore: null,
        frontendRating: null,
        frontendBreakdown: null,
        findings: null,
        findingsCount: null,
        heroLine: null,
        simulation: null,
        specMeta: null,
        apiScore: null,
        apiRating: null,
        apiBreakdown: null,
        apiFindings: null,
        apiError: { code: result.code, message: result.message },
        durationMs,
        methodologyVersion: METHODOLOGY_VERSION,
        batchRunId
      };
    }

    // Extract spec metadata for the reference row
    const specMeta = {
      endpointCount: result.meta.endpointCount,
      specTitle: result.meta.specTitle || null,
      specVersion: result.meta.specVersion || null
    };

    // Shape 2: Not Evaluable (empty spec, 0 endpoints)
    if (result.scoredViews.api.score.total === null) {
      return {
        siteId: site.siteId,
        scanTimestamp,
        vertical: site.vertical,
        scanDate,
        scanMode: 'reference',
        status: 'not-evaluable',
        failureReason: null,
        failureMessage: null,
        frontendScore: null,
        frontendRating: null,
        frontendBreakdown: null,
        findings: null,
        findingsCount: null,
        heroLine: null,
        simulation: null,
        specMeta,
        apiScore: null,
        apiRating: 'Not Evaluable',
        apiBreakdown: {},
        apiFindings: {},
        apiError: null,
        durationMs,
        methodologyVersion: METHODOLOGY_VERSION,
        batchRunId
      };
    }

    // Shape 3: Normal score
    return {
      siteId: site.siteId,
      scanTimestamp,
      vertical: site.vertical,
      scanDate,
      scanMode: 'reference',
      status: 'success',
      failureReason: null,
      failureMessage: null,
      frontendScore: null,
      frontendRating: null,
      frontendBreakdown: null,
      findings: null,
      findingsCount: null,
      heroLine: null,
      simulation: null,
      specMeta,
      apiScore: result.scoredViews.api.score.total,
      apiRating: result.scoredViews.api.score.rating,
      apiBreakdown: result.scoredViews.api.score.breakdown,
      apiFindings: result.scoredViews.api.findings,
      apiError: null,
      durationMs,
      methodologyVersion: METHODOLOGY_VERSION,
      batchRunId
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;

    logger.warn('Benchmark reference scan failed', {
      siteId: site.siteId,
      errorCode: err?.code || null,
      errorMessage: err?.message || null
    });

    return {
      siteId: site.siteId,
      scanTimestamp,
      vertical: site.vertical,
      scanDate,
      scanMode: 'reference',
      status: 'failed',
      failureReason: err?.code || 'UNKNOWN_ERROR',
      failureMessage: err?.message || 'An unexpected error occurred.',
      frontendScore: null,
      frontendRating: null,
      frontendBreakdown: null,
      findings: null,
      findingsCount: null,
      heroLine: null,
      simulation: null,
      specMeta: null,
      apiScore: null,
      apiRating: null,
      apiBreakdown: null,
      apiFindings: null,
      apiError: { code: err?.code || 'UNKNOWN_ERROR', message: err?.message || 'An unexpected error occurred.' },
      durationMs,
      methodologyVersion: METHODOLOGY_VERSION,
      batchRunId
    };
  }
}

/**
 * Run the full benchmark batch across all 50 sites.
 *
 * @param {object} [options]
 * @param {string[]} [options.siteIds] - Subset of site IDs to run (for manual testing)
 * @returns {Promise<object>} Summary: {totalSites, completed, failed, notEvaluable, durationMs, batchRunId}
 */
export async function runBenchmark(options = {}) {
  const startTime = Date.now();
  const batchRunId = `run-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;

  // Determine which sites to scan
  let sites = BENCHMARK_SITES;
  if (options.siteIds && options.siteIds.length > 0) {
    sites = BENCHMARK_SITES.filter(s => options.siteIds.includes(s.siteId));
  }

  logger.info('Benchmark batch started', {
    batchRunId,
    totalSites: sites.length,
    subset: options.siteIds ? options.siteIds.length : null
  });

  const summary = { totalSites: sites.length, completed: 0, failed: 0, notEvaluable: 0, bedrockFallbacks: 0 };

  // Process in batches of CONCURRENCY
  for (let i = 0; i < sites.length; i += CONCURRENCY) {
    const batch = sites.slice(i, i + CONCURRENCY);

    const batchPromises = batch.map(async (site) => {
      // Door scan (all sites)
      const doorResult = await runDoorScan(site, batchRunId);

      // Accumulate fallback count, then strip before persisting
      if (doorResult._bedrockFallbacks) {
        summary.bedrockFallbacks += doorResult._bedrockFallbacks;
      }
      delete doorResult._bedrockFallbacks;

      await writeBenchmarkResult(doorResult);

      if (doorResult.status === 'success') {
        summary.completed++;
      } else {
        summary.failed++;
      }

      // Reference scan (SaaS sites with spec URL only)
      if (site.referenceSpecUrl) {
        const refResult = await runReferenceScan(site, batchRunId);
        await writeBenchmarkResult(refResult);

        if (refResult.status === 'not-evaluable') {
          summary.notEvaluable++;
        } else if (refResult.status === 'failed') {
          summary.failed++;
        } else {
          summary.completed++;
        }
      }
    });

    await Promise.all(batchPromises);

    // Inter-batch delay (skip after last batch)
    if (i + CONCURRENCY < sites.length) {
      await sleep(INTER_BATCH_DELAY_MS);
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info('Benchmark batch completed', {
    batchRunId,
    ...summary,
    durationMs
  });

  return { ...summary, durationMs, batchRunId };
}
