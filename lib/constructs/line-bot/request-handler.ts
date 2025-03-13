import * as cdk from 'aws-cdk-lib';
import {
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

type RequestHandlerProps = {
  stateMachine: cdk.aws_stepfunctions.StateMachine,
  lineChannelAccessToken: string,
  lineChannelSecret: string,
}

// -----------------------------
// Lambda Function for RequestHandler
// -----------------------------
export class RequestHandler extends Construct {

  public readonly lambdaFunction: cdk.aws_lambda.IFunction;

  constructor (scope: Construct, id: string, props: RequestHandlerProps){
    super(scope, id);

    const {
      stateMachine,
      lineChannelAccessToken,
      lineChannelSecret
    } = props;

    // -----------------------------
    // Role for Lambda Function
    // -----------------------------
    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        'policy': new iam.PolicyDocument({
          statements:[
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'states:StartExecution',
              ],
              resources: [
                stateMachine.stateMachineArn,
              ],
            }),
          ]
        }),
      }
    });

    // -----------------------------
    // Lambda Function
    // -----------------------------
    const lambdaFunction = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'Function', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      entry: 'assets/line-bot/request-handler/handler.ts',
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(28),
      role: role,
      bundling: {
        minify: true,
        tsconfig: 'assets/line-bot/request-handler/tsconfig.json',
        format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
      },
      environment: {
        LINE_CHANNEL_ACCESS_TOKEN: lineChannelAccessToken,
        LINE_CHANNEL_SECRET: lineChannelSecret,
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
      },
      awsSdkConnectionReuse: false,
      loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
      logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
      systemLogLevelV2: cdk.aws_lambda.SystemLogLevel.WARN,
      applicationLogLevelV2: cdk.aws_lambda.ApplicationLogLevel.DEBUG,
      // tracing: cdk.aws_lambda.Tracing.ACTIVE,
    });

    this.lambdaFunction = lambdaFunction;
  }
}