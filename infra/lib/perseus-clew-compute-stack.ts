import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { PerseusClewDataStack } from './perseus-clew-data-stack';

interface ComputeStackProps extends cdk.StackProps {
  dataStack: PerseusClewDataStack;
}

/**
 * Perseus Clew Compute Stack
 * Lambda functions, API Gateway HTTP API, EventBridge refresh rule.
 */
export class PerseusClewComputeStack extends cdk.Stack {
  public readonly scanLambda: lambda.DockerImageFunction;
  public readonly httpApi: apigateway.HttpApi;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { dataStack } = props;

    // Scan Lambda (Docker container)
    this.scanLambda = new lambda.DockerImageFunction(this, 'ScanLambda', {
      functionName: 'PerseusClew-Scan',
      code: lambda.DockerImageCode.fromImageAsset('../', {
        file: 'Dockerfile'
      }),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
      environment: {
        NODE_ENV: 'production',
        AWS_REGION_OVERRIDE: this.region,
        DYNAMODB_SCAN_RESULTS_TABLE: dataStack.scanResultsTable.tableName,
        DYNAMODB_SCAN_CACHE_TABLE: dataStack.scanCacheTable.tableName,
        DYNAMODB_BENCHMARK_TABLE: dataStack.benchmarkTable.tableName,
        DYNAMODB_COUNTERS_TABLE: dataStack.scanCountersTable.tableName,
        PERSEUS_USER_AGENT: 'Agentis Lux/0.1 (+https://agentislux.io/about-scanner)',
        LOG_LEVEL: 'info'
      },
      description: 'Perseus Clew scan engine: fetch, parse, check, score, respond'
    });

    // Grant DynamoDB access
    dataStack.scanResultsTable.grantReadWriteData(this.scanLambda);
    dataStack.scanCacheTable.grantReadWriteData(this.scanLambda);
    dataStack.benchmarkTable.grantReadData(this.scanLambda);
    dataStack.scanCountersTable.grantReadWriteData(this.scanLambda);

    // Grant Bedrock InvokeModel (hero-line + Layer 2 simulation)
    this.scanLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:us-east-1::foundation-model/claude-haiku-4-5-20251001']
    }));

    // HTTP API (API Gateway v2)
    this.httpApi = new apigateway.HttpApi(this, 'HttpApi', {
      apiName: 'PerseusClew-API',
      description: 'Perseus Clew scan engine API',
      corsPreflight: {
        allowOrigins: ['https://agentislux.io'],
        allowMethods: [apigateway.CorsHttpMethod.POST, apigateway.CorsHttpMethod.GET],
        allowHeaders: ['Content-Type', 'Authorization']
      }
    });

    // Routes
    const scanIntegration = new integrations.HttpLambdaIntegration('ScanIntegration', this.scanLambda);

    this.httpApi.addRoutes({
      path: '/scan',
      methods: [apigateway.HttpMethod.POST],
      integration: scanIntegration
    });

    this.httpApi.addRoutes({
      path: '/health',
      methods: [apigateway.HttpMethod.GET],
      integration: scanIntegration
    });

    // Benchmark refresh Lambda (same container, different handler)
    const refreshLambda = new lambda.DockerImageFunction(this, 'RefreshLambda', {
      functionName: 'PerseusClew-BenchmarkRefresh',
      code: lambda.DockerImageCode.fromImageAsset('../', {
        file: 'Dockerfile',
        cmd: ['dist/handlers/refresh.handler']
      }),
      memorySize: 1024,
      timeout: cdk.Duration.minutes(15),
      environment: {
        NODE_ENV: 'production',
        DYNAMODB_BENCHMARK_TABLE: dataStack.benchmarkTable.tableName,
        PERSEUS_USER_AGENT: 'Agentis Lux/0.1 (+https://agentislux.io/about-scanner)',
        LOG_LEVEL: 'info'
      },
      description: 'Perseus Clew benchmark refresh: monthly rescan of 50 sites'
    });

    dataStack.benchmarkTable.grantReadWriteData(refreshLambda);

    // Grant Bedrock InvokeModel (hero-line + simulation per benchmark site)
    refreshLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:us-east-1::foundation-model/claude-haiku-4-5-20251001']
    }));

    // EventBridge rule: monthly refresh (1st of month, 6am UTC)
    new events.Rule(this, 'BenchmarkRefreshRule', {
      ruleName: 'PerseusClew-BenchmarkRefresh-Monthly',
      schedule: events.Schedule.cron({ minute: '0', hour: '6', day: '1', month: '*' }),
      targets: [new targets.LambdaFunction(refreshLambda)],
      enabled: true,
      description: 'Monthly benchmark refresh for the 50-site dataset'
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', { value: this.httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'ScanLambdaArn', { value: this.scanLambda.functionArn });
  }
}
