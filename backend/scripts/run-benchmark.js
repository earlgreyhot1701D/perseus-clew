/**
 * Perseus Clew: CLI entry point for manual benchmark runs.
 *
 * Usage:
 *   npm run benchmark                       # Run all 50 sites
 *   npm run benchmark -- --sites stripe,danluu  # Run subset
 *
 * Requires AWS credentials (or DYNAMODB_ENDPOINT for local).
 * Set MOCK_BEDROCK=true for local dev (hero/sim fall back to template).
 */

import { runBenchmark } from '../src/benchmark/runner.js';

const args = process.argv.slice(2);
let siteIds = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sites' && args[i + 1]) {
    siteIds = args[i + 1].split(',').map(s => s.trim());
  }
}

const options = siteIds ? { siteIds } : {};

console.log(`Perseus Clew benchmark runner`);
console.log(`Sites: ${siteIds ? siteIds.join(', ') : 'all 50'}`);
console.log(`Starting...\n`);

try {
  const summary = await runBenchmark(options);
  console.log(`\nBenchmark complete.`);
  console.log(`  Batch run ID: ${summary.batchRunId}`);
  console.log(`  Total sites:  ${summary.totalSites}`);
  console.log(`  Completed:    ${summary.completed}`);
  console.log(`  Failed:       ${summary.failed}`);
  console.log(`  Not Evaluable:${summary.notEvaluable}`);
  console.log(`  Duration:     ${(summary.durationMs / 1000).toFixed(1)}s`);
} catch (err) {
  console.error(`Benchmark crashed:`, err.message);
  process.exit(1);
}
