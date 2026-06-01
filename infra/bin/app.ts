#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PerseusClewBaseStack } from '../lib/perseus-clew-base-stack';
import { PerseusClewDataStack } from '../lib/perseus-clew-data-stack';
import { PerseusClewComputeStack } from '../lib/perseus-clew-compute-stack';
import { PerseusClewMonitoringStack } from '../lib/perseus-clew-monitoring-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
};

const environment = app.node.tryGetContext('environment') || 'production';

const baseStack = new PerseusClewBaseStack(app, `PerseusClew-Base-${environment}`, {
  env,
  description: 'Perseus Clew base infrastructure (IAM, shared resources)'
});

const dataStack = new PerseusClewDataStack(app, `PerseusClew-Data-${environment}`, {
  env,
  description: 'Perseus Clew data layer (DynamoDB tables, S3)'
});

const computeStack = new PerseusClewComputeStack(app, `PerseusClew-Compute-${environment}`, {
  env,
  description: 'Perseus Clew compute layer (Lambda, API Gateway)',
  dataStack
});
computeStack.addDependency(dataStack);

const monitoringStack = new PerseusClewMonitoringStack(app, `PerseusClew-Monitoring-${environment}`, {
  env,
  description: 'Perseus Clew monitoring (CloudWatch, alarms, SNS)'
});
monitoringStack.addDependency(computeStack);
