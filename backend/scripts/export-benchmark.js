/**
 * Perseus Clew: Export benchmark data from DynamoDB.
 * Produces analysis JSON + public CSV for the specified batch run.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { writeFileSync } from 'fs';
import { BENCHMARK_SITES } from '../src/benchmark/sites.js';

const BATCH_RUN_ID = process.argv[2] || 'run-2026-06-19-f8cb741a';

const verticalMap = Object.fromEntries(BENCHMARK_SITES.map(s => [s.siteId, s.vertical]));

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

let items = [];
let lastKey = undefined;
do {
  const res = await client.send(new ScanCommand({
    TableName: 'PerseusClew-BenchmarkScans',
    FilterExpression: 'batchRunId = :b',
    ExpressionAttributeValues: { ':b': BATCH_RUN_ID },
    ExclusiveStartKey: lastKey
  }));
  items.push(...res.Items);
  lastKey = res.LastEvaluatedKey;
} while (lastKey);

console.log(`Fetched ${items.length} rows for batch ${BATCH_RUN_ID}`);

// Enrich with vertical + flatten for analysis
const analysis = items.map(row => ({
  siteId: row.siteId,
  vertical: verticalMap[row.siteId] || 'unknown',
  scanMode: row.scanMode,
  status: row.status,
  failureReason: row.failureReason || null,
  frontendScore: row.frontendScore ?? null,
  frontendRating: row.frontendRating || null,
  semantic_html_earned: row.frontendBreakdown?.semantic_html?.earned ?? null,
  semantic_html_max: row.frontendBreakdown?.semantic_html?.max ?? null,
  form_accessibility_earned: row.frontendBreakdown?.form_accessibility?.earned ?? null,
  form_accessibility_max: row.frontendBreakdown?.form_accessibility?.max ?? null,
  aria_earned: row.frontendBreakdown?.aria?.earned ?? null,
  aria_max: row.frontendBreakdown?.aria?.max ?? null,
  structured_data_earned: row.frontendBreakdown?.structured_data?.earned ?? null,
  structured_data_max: row.frontendBreakdown?.structured_data?.max ?? null,
  content_in_html_earned: row.frontendBreakdown?.content_in_html?.earned ?? null,
  content_in_html_max: row.frontendBreakdown?.content_in_html?.max ?? null,
  link_navigation_earned: row.frontendBreakdown?.link_navigation?.earned ?? null,
  link_navigation_max: row.frontendBreakdown?.link_navigation?.max ?? null,
  apiScore: row.apiScore ?? null,
  apiRating: row.apiRating || null,
  heroLineText: row.heroLine?.text || null,
  heroLineSource: row.heroLine?.source || null,
  simulationAvailable: row.simulation?.available ?? null,
  durationMs: row.durationMs ?? null,
})).sort((a, b) =>
  a.vertical.localeCompare(b.vertical) ||
  a.siteId.localeCompare(b.siteId) ||
  a.scanMode.localeCompare(b.scanMode)
);

// Write analysis JSON
writeFileSync('benchmark-analysis.json', JSON.stringify(analysis, null, 2));
console.log(`Written benchmark-analysis.json (${analysis.length} rows)`);

// Public CSV
const csvHeaders = [
  'site_id', 'vertical', 'scan_mode', 'status', 'failure_reason',
  'frontend_score', 'frontend_rating',
  'semantic_html', 'form_accessibility', 'aria', 'structured_data', 'content_in_html', 'link_navigation',
  'api_score', 'api_rating',
  'hero_line_source', 'simulation_available'
];

function esc(v) {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const csvRows = analysis.map(r => [
  r.siteId, r.vertical, r.scanMode, r.status, r.failureReason || '',
  r.frontendScore ?? '', r.frontendRating || '',
  r.semantic_html_earned !== null ? `${r.semantic_html_earned}/${r.semantic_html_max}` : '',
  r.form_accessibility_earned !== null ? `${r.form_accessibility_earned}/${r.form_accessibility_max}` : '',
  r.aria_earned !== null ? `${r.aria_earned}/${r.aria_max}` : '',
  r.structured_data_earned !== null ? `${r.structured_data_earned}/${r.structured_data_max}` : '',
  r.content_in_html_earned !== null ? `${r.content_in_html_earned}/${r.content_in_html_max}` : '',
  r.link_navigation_earned !== null ? `${r.link_navigation_earned}/${r.link_navigation_max}` : '',
  r.apiScore ?? '', r.apiRating || '',
  r.heroLineSource || '', r.simulationAvailable ?? ''
].map(esc).join(','));

const csv = [csvHeaders.join(','), ...csvRows].join('\n');
writeFileSync('benchmark-2026-06-19.csv', csv);
console.log(`Written benchmark-2026-06-19.csv (${csvRows.length} data rows)`);

// Print samples
console.log('\n=== ANALYSIS JSON SAMPLE (first 3) ===');
for (const row of analysis.slice(0, 3)) {
  console.log(JSON.stringify(row));
}

console.log('\n=== CSV SAMPLE (header + 5 rows) ===');
const lines = csv.split('\n');
for (let i = 0; i < Math.min(6, lines.length); i++) {
  console.log(lines[i]);
}
