/**
 * Perseus Clew: Benchmark refresh Lambda handler.
 *
 * Entry point for the PerseusClew-BenchmarkRefresh Lambda.
 * Invoked by EventBridge (monthly) or manually via console/CLI.
 *
 * Runs the full 50-site benchmark batch and returns a summary.
 * Timeout: 15 minutes (set in CDK).
 *
 * See infra/lib/perseus-clew-compute-stack.ts (RefreshLambda).
 */

import { runBenchmark } from '../benchmark/runner.js';
import { logger } from '../shared/logger.js';

/**
 * Lambda handler for benchmark refresh.
 *
 * @param {object} event - EventBridge scheduled event or manual invocation payload
 * @returns {object} Lambda response with benchmark summary
 */
export const handler = async (event) => {
  logger.info('Benchmark refresh invoked', {
    source: event?.source || 'manual',
    detailType: event?.['detail-type'] || null
  });

  try {
    // Support subset runs via manual invocation payload
    const options = {};
    if (event?.siteIds && Array.isArray(event.siteIds)) {
      options.siteIds = event.siteIds;
    }

    const summary = await runBenchmark(options);

    logger.info('Benchmark refresh completed', summary);

    return {
      statusCode: 200,
      body: JSON.stringify(summary)
    };
  } catch (err) {
    // This catch should never fire (runner isolates per-site),
    // but defends against truly unexpected crashes.
    logger.error('Benchmark refresh unexpected error', {
      errorCode: err?.code || null,
      errorMessage: err?.message || null
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'BENCHMARK_CRASH',
        message: 'The benchmark batch encountered an unexpected error.'
      })
    };
  }
};
