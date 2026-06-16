/**
 * Perseus Clew: DynamoDB writes for benchmark results.
 *
 * Writes to PerseusClew-BenchmarkScans table.
 * PK: siteId, SK: scanTimestamp (prefixed with door# or reference#).
 *
 * Fail-soft: logs on failure, never throws to caller.
 * Mirrors the pattern in scan-store.js.
 *
 * See infra/lib/perseus-clew-data-stack.ts (BenchmarkScans table).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from '../shared/logger.js';

const dynamoConfig = process.env.DYNAMODB_ENDPOINT
  ? { region: 'us-east-1', endpoint: process.env.DYNAMODB_ENDPOINT, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
  : { region: process.env.AWS_REGION || 'us-east-1' };

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient(dynamoConfig));

const BENCHMARK_TABLE = process.env.DYNAMODB_BENCHMARK_TABLE || 'PerseusClew-BenchmarkScans';

/**
 * Write a benchmark result to DynamoDB.
 * Fail-soft: logs on failure, never throws.
 *
 * @param {object} result - The benchmark result record (from runner.js)
 */
export async function writeBenchmarkResult(result) {
  if (!result || !result.siteId || !result.scanTimestamp) {
    logger.warn('BenchmarkScans write skipped: missing siteId or scanTimestamp', {
      siteId: result?.siteId || null
    });
    return;
  }

  try {
    await ddbClient.send(new PutCommand({
      TableName: BENCHMARK_TABLE,
      Item: result
    }));
  } catch (err) {
    logger.warn('BenchmarkScans write failed', {
      table: BENCHMARK_TABLE,
      siteId: result.siteId,
      scanMode: result.scanMode,
      errorCode: err.name,
      errorMessage: err.message
    });
  }
}
