import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/**
 * Perseus Clew Monitoring Stack
 * CloudWatch alarms, SNS topic for email alerts.
 */
export class PerseusClewMonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SNS topic for alerts
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'PerseusClew-Alerts',
      displayName: 'Perseus Clew Alerts'
    });

    // Add email subscription utilizing CDK context or falling back to placeholder
    const alertEmail = this.node.tryGetContext('alertEmail') || 'your-email@example.com';
    alertTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));

    // Alarm: Scan Lambda error rate > 10%
    const scanErrorAlarm = new cloudwatch.Alarm(this, 'ScanErrorRateAlarm', {
      alarmName: 'PerseusClew-ScanErrorRate',
      alarmDescription: 'Scan Lambda error rate exceeds 10%',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: { FunctionName: 'PerseusClew-Scan' },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5)
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    });
    scanErrorAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // Alarm: Scan Lambda duration > 15 seconds average
    const scanDurationAlarm = new cloudwatch.Alarm(this, 'ScanDurationAlarm', {
      alarmName: 'PerseusClew-ScanDuration',
      alarmDescription: 'Scan Lambda average duration exceeds 15 seconds',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Duration',
        dimensionsMap: { FunctionName: 'PerseusClew-Scan' },
        statistic: 'Average',
        period: cdk.Duration.minutes(5)
      }),
      threshold: 15000,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    });
    scanDurationAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // Metric filter & Alarm: Simulation fallback
    const scanLogGroup = logs.LogGroup.fromLogGroupName(this, 'ScanLogGroup', '/aws/lambda/PerseusClew-Scan');

    new logs.MetricFilter(this, 'SimulationFallbackMetricFilter', {
      logGroup: scanLogGroup,
      metricNamespace: 'PerseusClew',
      metricName: 'SimulationFallbackCount',
      filterPattern: logs.FilterPattern.literal('"Simulation fallback"'),
      metricValue: '1',
      defaultValue: 0
    });

    const simulationFallbackAlarm = new cloudwatch.Alarm(this, 'SimulationFallbackAlarm', {
      alarmName: 'PerseusClew-SimulationFallback',
      alarmDescription: 'Alert when simulation fallback occurs (rate climbing from 2.17%)',
      metric: new cloudwatch.Metric({
        namespace: 'PerseusClew',
        metricName: 'SimulationFallbackCount',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    simulationFallbackAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    new cdk.CfnOutput(this, 'AlertTopicArn', { value: alertTopic.topicArn });
  }
}
