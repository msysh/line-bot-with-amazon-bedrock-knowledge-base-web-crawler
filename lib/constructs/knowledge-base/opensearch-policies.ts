import * as cdk from 'aws-cdk-lib';
import {
  aws_opensearchserverless as aoss,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

type OpenSearchPoliciesProps = {
  account: string,
  aossCollection: cdk.aws_opensearchserverless.CfnCollection,
  createIndexCustomResourceRole: cdk.aws_iam.IRole,
  knowledgeBaseServiceRole: cdk.aws_iam.IRole,
};

export class OpenSearchPolicies extends Construct {

  public readonly encryptionPolicy: aoss.CfnSecurityPolicy;
  public readonly networkPolicy: aoss.CfnSecurityPolicy;
  public readonly accessPolicy: aoss.CfnAccessPolicy;

  constructor (scope: Construct, id: string, props: OpenSearchPoliciesProps){
    super(scope, id);

    const account = props.account;
    const collection = props.aossCollection;
    const createIndexCustomResourceRole = props.createIndexCustomResourceRole;
    const knowledgeBaseServiceRole = props.knowledgeBaseServiceRole;

    // Encryption Security Policy
    const encryptionPolicy = new aoss.CfnSecurityPolicy(this, 'EncryptionSecurityPolicy', {
      name: collection.name,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [`collection/${collection.name}`],
          },
        ],
        AWSOwnedKey: true,
      }),
    });

    // Network Security Policy
    const networkPolicy = new aoss.CfnSecurityPolicy(this, 'NetworkSecurityPolicy', {
      name: collection.name,
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/${collection.name}`],
            },
            {
              ResourceType: 'dashboard',
              Resource: [`collection/${collection.name}`],
            },
          ],
          AllowFromPublic: true,
        },
      ]),
    });

    const accessPolicy = new aoss.CfnAccessPolicy(this, 'AccessPolicy', {
      name: collection.name,
      type: 'data',
      policy: JSON.stringify([
        {
          Rules:[
            {
              ResourceType: 'collection',
              Resource: [`collection/${collection.name}`],
              Permission: [
                'aoss:DescribeCollectionItems',
                'aoss:CreateCollectionItems',
                'aoss:UpdateCollectionItems',
              ],
            },
            {
              ResourceType: 'index',
              Resource: [`index/${collection.name}/*`],
              Permission: [
                'aoss:UpdateIndex',
                'aoss:DescribeIndex',
                'aoss:ReadDocument',
                'aoss:WriteDocument',
                'aoss:CreateIndex',
              ],
            },
          ],
          Principal: [
            `arn:aws:iam::${account}:role/Admin`,
            createIndexCustomResourceRole.roleArn,
            knowledgeBaseServiceRole.roleArn,
          ]
        }
      ])
    });

    this.encryptionPolicy = encryptionPolicy;
    this.networkPolicy = networkPolicy;
    this.accessPolicy = accessPolicy;
  }
}