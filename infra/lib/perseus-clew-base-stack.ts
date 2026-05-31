import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * Perseus Clew Base Stack
 * Shared resources that rarely change: IAM roles, base policies.
 */
export class PerseusClewBaseStack extends cdk.Stack {
  public readonly scanLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda execution role for scan engine
    this.scanLambdaRole = new iam.Role(this, 'ScanLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      description: 'Perseus Clew scan Lambda execution role'
    });

    // Bedrock invoke permission
    this.scanLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: ['*']
    }));

    // SSM read permission for config
    this.scanLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:GetParametersByPath'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/agentislux/*`]
    }));
  }
}
