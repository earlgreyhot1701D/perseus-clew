import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Perseus Clew Data Stack
 * DynamoDB tables and S3 buckets.
 *
 * Tables:
 * - BenchmarkScans: 50-site benchmark data (read-heavy)
 * - ScanCounters: aggregate anonymous counters
 * - ScanResults: 24h TTL, shareable result links
 * - ScanCache: 15m TTL, target-site fetch dedup
 * - Users: signed-in stub (auth wired, history empty)
 */
export class PerseusClewDataStack extends cdk.Stack {
  public readonly benchmarkTable: dynamodb.Table;
  public readonly scanCountersTable: dynamodb.Table;
  public readonly scanResultsTable: dynamodb.Table;
  public readonly scanCacheTable: dynamodb.Table;
  public readonly usersTable: dynamodb.Table;
  public readonly ogImageBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Table 1: BenchmarkScans
    this.benchmarkTable = new dynamodb.Table(this, 'BenchmarkScans', {
      tableName: 'PerseusClew-BenchmarkScans',
      partitionKey: { name: 'siteId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'scanTimestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // GSI for per-vertical benchmark queries
    this.benchmarkTable.addGlobalSecondaryIndex({
      indexName: 'vertical-timestamp-index',
      partitionKey: { name: 'vertical', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'scanTimestamp', type: dynamodb.AttributeType.STRING }
    });

    // Table 2: ScanCounters
    this.scanCountersTable = new dynamodb.Table(this, 'ScanCounters', {
      tableName: 'PerseusClew-ScanCounters',
      partitionKey: { name: 'counterKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Table 3: ScanResults (24h TTL)
    this.scanResultsTable = new dynamodb.Table(this, 'ScanResults', {
      tableName: 'PerseusClew-ScanResults',
      partitionKey: { name: 'resultId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Table 4: ScanCache (15m TTL)
    this.scanCacheTable = new dynamodb.Table(this, 'ScanCache', {
      tableName: 'PerseusClew-ScanCache',
      partitionKey: { name: 'urlHash', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Table 5: Users (signed-in stub)
    this.usersTable = new dynamodb.Table(this, 'Users', {
      tableName: 'PerseusClew-Users',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // S3 bucket for OG social card images
    this.ogImageBucket = new s3.Bucket(this, 'OgImageBucket', {
      bucketName: `perseus-clew-og-images-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false
      })
    });

    // Outputs for cross-stack references
    new cdk.CfnOutput(this, 'BenchmarkTableName', { value: this.benchmarkTable.tableName });
    new cdk.CfnOutput(this, 'ScanResultsTableName', { value: this.scanResultsTable.tableName });
    new cdk.CfnOutput(this, 'ScanCacheTableName', { value: this.scanCacheTable.tableName });
  }
}
