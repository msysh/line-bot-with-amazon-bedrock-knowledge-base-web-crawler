import * as cdk from 'aws-cdk-lib';
import {
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

type ServiceRolesProps = {
  account: string,
  region: string,
  aossCollection: cdk.aws_opensearchserverless.CfnCollection,
};

export class ServiceRoles extends Construct {

  public readonly createIndexCustomResourceRole: cdk.aws_iam.IRole;
  public readonly knowledgeBaseServiceRole: cdk.aws_iam.IRole;

  constructor (scope: Construct, id: string, props: ServiceRolesProps){
    super(scope, id);

    const account = props.account;
    const region = props.region;
    const collectionArn = props.aossCollection.attrArn;

    // -----------------------------
    // For Custom Resource Lambda Function
    // -----------------------------
    const createIndexCustomResourceRole = new iam.Role(this, 'CreateIndexCustomResourceRole', {
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
                'aoss:APIAccessAll',
              ],
              resources: [
                collectionArn,
              ],
            }),
          ]
        }),
      }
    });
    this.createIndexCustomResourceRole = createIndexCustomResourceRole;

    // -----------------------------
    // For Knowledge Bases
    // -----------------------------
    const knowledgeBaseServiceRole = new iam.Role(this, 'KnowledgeBaseRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com').withConditions({
        StringEquals: {
          'aws:SourceAccount': account,
        },
        ArnLike: {
          'AWS:SourceArn': `arn:aws:bedrock:${region}:${account}:knowledge-base/*`,
        },
      }),
      inlinePolicies: {
        'policy': new iam.PolicyDocument({
          statements:[
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'aoss:APIAccessAll',
              ],
              resources: [
                collectionArn,
              ]
            })
          ]
        })
      }
    });
    this.knowledgeBaseServiceRole = knowledgeBaseServiceRole;
  }
}