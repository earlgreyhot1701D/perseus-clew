/**
 * Perseus Clew: DynamoDB CRUD for ScanResults and ScanCache.
 *
 * ScanResults: 24h TTL, opaque resultId key, backs shareable links.
 * ScanCache: 15m TTL, URL-hash key, target-site fetch dedup.
 *
 * All writes are fail-soft: log on failure, never throw to caller.
 * The scan result is the product; persistence is a side effect.
 *
 * See BACKEND-SHARED.md section 10.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { AppError } from './errors.js';
import { logger } from './logger.js';

const dynamoConfig = process.env.DYNAMODB_ENDPOINT
  ? { region: 'us-east-1', endpoint: process.env.DYNAMODB_ENDPOINT, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
  : { region: process.env.AWS_REGION || 'us-east-1' };

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient(dynamoConfig));

const SCAN_RESULTS_TABLE = process.env.DYNAMODB_SCAN_RESULTS_TABLE || 'PerseusClew-ScanResults';
const SCAN_CACHE_TABLE = process.env.DYNAMODB_SCAN_CACHE_TABLE || 'PerseusClew-ScanCache';

const TTL_24H_SECONDS = 24 * 60 * 60;
const TTL_15M_SECONDS = 15 * 60;

/**
 * Write a scan result to ScanResults (24h TTL).
 * Fail-soft: logs on failure, never throws.
 */
export async function writeResult(resultId, domain, score, ratingLabel, heroLine, categoryBreakdown, findings) {
  if (!resultId || !domain) {
    throw new AppError('VALIDATION_MISSING_ARGS', 'writeResult requires resultId and domain');
  }

  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + TTL_24H_SECONDS;

  try {
    await ddbClient.send(new PutCommand({
      TableName: SCAN_RESULTS_TABLE,
      Item: {
        resultId,
        domain,
        score,
        ratingLabel,
        heroLine,
        categoryBreakdown,
        findings,
        createdAt: now.toISOString(),
        ttl
      }
    }));
  } catch (err) {
    logger.warn('ScanResults write failed', {
      table: SCAN_RESULTS_TABLE,
      resultId,
      domain,
      errorCode: err.name,
      errorMessage: err.message
    });
  }
}

/**
 * Write a scan result to ScanCache (15m TTL).
 * Fail-soft: logs on failure, never throws.
 */
export async function writeCache(urlHash, domain, result) {
  if (!urlHash || !domain) {
    throw new AppError('VALIDATION_MISSING_ARGS', 'writeCache requires urlHash and domain');
  }

  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + TTL_15M_SECONDS;

  try {
    await ddbClient.send(new PutCommand({
      TableName: SCAN_CACHE_TABLE,
      Item: {
        urlHash,
        domain,
        result,
        cachedAt: now.toISOString(),
        ttl
      }
    }));
  } catch (err) {
    logger.warn('ScanCache write failed', {
      table: SCAN_CACHE_TABLE,
      urlHash,
      domain,
      errorCode: err.name,
      errorMessage: err.message
    });
  }
}

/**
 * Read a cached scan result by URL hash.
 * Returns the cached result if found, otherwise null. Never throws on DynamoDB errors.
 */
export async function readCache(urlHash) {
  if (!urlHash) {
    throw new AppError('VALIDATION_MISSING_ARGS', 'readCache requires urlHash');
  }

  try {
    const response = await ddbClient.send(new GetCommand({
      TableName: SCAN_CACHE_TABLE,
      Key: { urlHash }
    }));

    if (!response.Item) return null;

    const { ttl: _ttl, ...item } = response.Item;
    return item;
  } catch (err) {
    logger.warn('ScanCache read failed', {
      table: SCAN_CACHE_TABLE,
      urlHash,
      errorCode: err.name,
      errorMessage: err.message
    });
    return null;
  }
}

/**
 * Read a scan result by resultId (for shareable links).
 * Returns the row if found, otherwise null. Never throws on DynamoDB errors.
 */
export async function readResult(resultId) {
  if (!resultId) {
    throw new AppError('VALIDATION_MISSING_ARGS', 'readResult requires resultId');
  }

  try {
    const response = await ddbClient.send(new GetCommand({
      TableName: SCAN_RESULTS_TABLE,
      Key: { resultId }
    }));

    if (!response.Item) return null;

    const { ttl: _ttl, ...item } = response.Item;
    return item;
  } catch (err) {
    logger.warn('ScanResults read failed', {
      table: SCAN_RESULTS_TABLE,
      resultId,
      errorCode: err.name,
      errorMessage: err.message
    });
    return null;
  }
}
