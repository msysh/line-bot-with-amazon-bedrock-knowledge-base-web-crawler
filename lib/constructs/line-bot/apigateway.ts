import * as cdk from 'aws-cdk-lib';
import {
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

type ApiGatewayProps = {
  logGroupName: string,
  requestHandler: cdk.aws_lambda.IFunction,
};

export class ApiGateway extends Construct {

  public readonly httpApi: cdk.aws_apigatewayv2.IHttpApi;

  constructor (scope: Construct, id: string, props: ApiGatewayProps){
    super(scope, id);

    const {
      logGroupName,
      requestHandler,
    } = props;

    const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/apigateway-v2/${logGroupName}`,
      retention: cdk.aws_logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      inlinePolicies: {
        'policy': new iam.PolicyDocument({
          statements:[
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'lambda:InvokeFunction',
              ],
              resources: [
                requestHandler.functionArn,
              ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:DescribeLogGroups',
                'logs:DescribeLogStreams',
                'logs:GetLogEvents',
                'logs:FilterLogEvents',
              ],
              resources: [
                logGroup.logGroupArn,
              ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogDelivery',
                'logs:PutResourcePolicy',
                'logs:UpdateLogDelivery',
                'logs:DeleteLogDelivery',
                'logs:CreateLogGroup',
                'logs:DescribeResourcePolicies',
                'logs:GetLogDelivery',
                'logs:ListLogDeliveries',
              ],
              resources: [ '*' ]
            }),
          ]
        }),
      }
    });

    const httpApi = new cdk.aws_apigatewayv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [ '*' ],
        allowMethods: [ cdk.aws_apigatewayv2.CorsHttpMethod.POST ],
        allowHeaders: [ '*' ],
      },
      createDefaultStage: true,
    });

    const integration = new cdk.aws_apigatewayv2_integrations.HttpLambdaIntegration('LambdaIntegration', requestHandler, {
      payloadFormatVersion: cdk.aws_apigatewayv2.PayloadFormatVersion.VERSION_2_0,
    });

    httpApi.addRoutes({
      path: '/',
      methods: [ cdk.aws_apigatewayv2.HttpMethod.POST ],
      integration: integration,
    });

    this.httpApi = httpApi;

    // -----------------------------
    // Output HTTP API endpoint URL
    // -----------------------------
    new cdk.CfnOutput(this, 'OutputHttpApiUrl', {
      description: 'HTTP API URL',
      value: httpApi.url || 'no url',
    });
  }
}