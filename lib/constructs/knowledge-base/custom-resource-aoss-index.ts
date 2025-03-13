import * as cdk from 'aws-cdk-lib';
import {
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

type CustomResourceAossIndexProps = {
  aossCollection: cdk.aws_opensearchserverless.CfnCollection,
  aossIndexName: string,
  customResourceLambdaFunctionRole: iam.IRole;
};

export class CustomResourceAossIndex extends Construct {

  public readonly customResource: cdk.CustomResource;

  constructor (scope: Construct, id: string, props: CustomResourceAossIndexProps){
    super(scope, id);

    const collection = props.aossCollection;
    const collectionEndpoint = collection.attrCollectionEndpoint;
    const collectionName = collection.name;
    const indexName = props.aossIndexName;
    const role = props.customResourceLambdaFunctionRole;

    // -----------------------------
    // Lambda Function
    // -----------------------------
    const lambdaFunction = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'Function', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: 'assets/custom-resource/aoss-index/handler.ts',
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.minutes(15),
      role: role,
      // bundling: {
      //   minify: true,
      //   tsconfig: 'assets/custom-resource/aoss-index/tsconfig.json',
      //   format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
      // },
      // environment: {
      //   SOME_VALUE: 'some-value',
      // },
      awsSdkConnectionReuse: false,
      logRetention: logs.RetentionDays.ONE_WEEK,
      loggingFormat: lambda.LoggingFormat.JSON,
      applicationLogLevelV2: lambda.ApplicationLogLevel.DEBUG,
      // tracing: lambda.Tracing.ACTIVE,
    });

    // -----------------------------
    // Custom Resource Provider
    // -----------------------------
    const provider = new cdk.custom_resources.Provider(this, 'Provider', {
      onEventHandler: lambdaFunction,
    });

    // -----------------------------
    // Custom Resource (AOSS Index)
    // -----------------------------
    const aossIndex = new cdk.CustomResource(this, 'AossIndex', {
      serviceToken: provider.serviceToken,
      properties: {
        collectionEndpoint: collectionEndpoint,
        collectionName: collectionName,
        indexName: indexName,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      resourceType: 'Custom::AossIndex',
    });

    this.customResource = aossIndex;
  }
}