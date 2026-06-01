/**
 * Perseus Clew: Create DynamoDB Local tables for local development.
 *
 * Run: npm run init:local
 * Requires: dynamodb-local running on port 8000 (via docker compose)
 *
 * DynamoDB Local runs -inMemory, so tables are wiped on restart.
 * Re-run this script after each `docker compose up`.
 *
 * Note: DynamoDB Local does not auto-expire TTL items. The QA check
 * verifies the ttl value is set correctly, not that rows disappear.
 * Real TTL expiry is verified in AWS only.
 */

import { DynamoDBClient, CreateTableCommand, UpdateTimeToLiveCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
});

async function createTable(params) {
  try {
    await client.send(new CreateTableCommand(params));
    console.log(`Created table: ${params.TableName}`);
  } catch (err) {
    if (err.name === 'ResourceInUseException') {
      console.log(`Table already exists: ${params.TableName}`);
    } else {
      throw err;
    }
  }
}

async function enableTtl(tableName, attributeName) {
  try {
    await client.send(new UpdateTimeToLiveCommand({
      TableName: tableName,
      TimeToLiveSpecification: { Enabled: true, AttributeName: attributeName }
    }));
    console.log(`TTL enabled on ${tableName} (attribute: ${attributeName})`);
  } catch (err) {
    // DynamoDB Local may not fully support TTL config; log and continue
    console.log(`TTL config note for ${tableName}: ${err.message}`);
  }
}

async function main() {
  // ScanResults (24h TTL, shareable links)
  await createTable({
    TableName: 'PerseusClew-ScanResults',
    KeySchema: [{ AttributeName: 'resultId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'resultId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST'
  });
  await enableTtl('PerseusClew-ScanResults', 'ttl');

  // ScanCache (15m TTL, target-site fetch dedup)
  await createTable({
    TableName: 'PerseusClew-ScanCache',
    KeySchema: [{ AttributeName: 'urlHash', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'urlHash', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST'
  });
  await enableTtl('PerseusClew-ScanCache', 'ttl');

  console.log('Local DynamoDB tables ready.');
}

main().catch((err) => {
  console.error('Failed to initialize local tables:', err.message);
  process.exit(1);
});
