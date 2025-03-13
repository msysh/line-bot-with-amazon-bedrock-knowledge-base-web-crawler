import * as cdk from 'aws-cdk-lib';
import {
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

type SessionDatabaseProps = {
}

export class SessionDatabase extends Construct {

  public readonly table: cdk.aws_dynamodb.ITable;

  constructor (scope: Construct, id: string, props?: SessionDatabaseProps){
    super(scope, id);

    // -----------------------------
    // DynamoDB Table for Knowledge Bases Session
    // -----------------------------
    const table = new cdk.aws_dynamodb.Table(this, 'DynamoDbTable', {
      partitionKey: {
        name: 'chat_id',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'ttl',
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.table = table;

    // -----------------------------
    // Output
    // -----------------------------
    new cdk.CfnOutput(this, 'OutputSessionTableName', {
      description: 'Knowledge Base Session Store Table',
      value: table.tableName,
    });
  }
}