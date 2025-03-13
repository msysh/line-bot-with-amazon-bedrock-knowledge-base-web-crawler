import * as cdk from 'aws-cdk-lib';
import {
  aws_bedrock as bedrock,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { OpenSearchCollection } from './opensearch-collection';

type KnowledgeBaseProps = {
  collection: OpenSearchCollection,
  vectorIndexName: string,
  knowledgeBaseName: string,
  knowledgeBaseDataSourceWebUrls: string[],
  knowledgeBaseEmbeddingModelArn: string,
  knowledgeBaseServiceRole: cdk.aws_iam.IRole,
  aossIndexForDepends: cdk.CustomResource,
};

export class KnowledgeBase extends Construct {

  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;

  constructor (scope: Construct, id: string, props: KnowledgeBaseProps){
    super(scope, id);

    const collection = props.collection.collection;
    const vectorIndexName = props.vectorIndexName;
    const knowledgeBaseName = props.knowledgeBaseName;
    const knowledgeBaseDataSourceWebUrls = props.knowledgeBaseDataSourceWebUrls;
    const knowledgeBaseEmbeddingModelArn = props.knowledgeBaseEmbeddingModelArn;
    const role = props.knowledgeBaseServiceRole;

    // const supplementalDataBucket = new cdk.aws_s3.Bucket(this, 'SupplementalDataBucket', {});

    role.attachInlinePolicy(new cdk.aws_iam.Policy(this, 'KnowledgeBaseModelAccessPolicy', {
      policyName: 'model-access',
      document: new iam.PolicyDocument({
        statements:[
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'bedrock:ListFoundationModels',
              'bedrock:ListCustomModels',
            ],
            resources: [ '*' ],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'bedrock:InvokeModel',
            ],
            resources: [
              knowledgeBaseEmbeddingModelArn,
            ],
          }),
        ]
      })
    }));

    // -----------------------------
    // Knowledge Bases
    // -----------------------------
    const cfnKnowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: knowledgeBaseName,
      roleArn: role.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: knowledgeBaseEmbeddingModelArn,
          embeddingModelConfiguration: {
            bedrockEmbeddingModelConfiguration: {
              dimensions: 1024,
            },
          },
          // supplementalDataStorageConfiguration: {
          //   supplementalDataStorageLocations: [
          //     {
          //       s3Location: {
          //         uri: supplementalDataBucket.bucketArn,
          //       },
          //       supplementalDataStorageLocationType: 'S3',
          //     }
          //   ]
          // },
        },
      },
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: collection.attrArn,
          fieldMapping: {
            metadataField: 'metadata',
            textField: 'text',
            vectorField: 'vector',
          },
          vectorIndexName: vectorIndexName,
        }
      },
    });

    // Data Source
    const cfnDataSource = new bedrock.CfnDataSource(this, 'DataSource', {
      name: `${knowledgeBaseName}-data-source`,
      knowledgeBaseId: cfnKnowledgeBase.attrKnowledgeBaseId,
      dataSourceConfiguration: {
        type: 'WEB',
        webConfiguration: {
          sourceConfiguration: {
            urlConfiguration: {
              seedUrls: knowledgeBaseDataSourceWebUrls.map((url) => {
                return { url: url }
              }),
            },
          },
          crawlerConfiguration: {
            crawlerLimits: {
              rateLimit: 30,
            },
            scope: 'HOST_ONLY',
          },
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'HIERARCHICAL',
          hierarchicalChunkingConfiguration: {
            levelConfigurations: [
              { maxTokens: 1500, },
              { maxTokens: 300, }
            ],
            overlapTokens: 60,
          }
        }
      },
      dataDeletionPolicy: 'DELETE',
    });

    this.knowledgeBase = cfnKnowledgeBase;

    new cdk.CfnOutput(this, 'Output-KnowledgeBaseIdAndDataSourceId', {
      description: 'Knowledge Bases ID and(|) Data Source ID',
      value: cfnDataSource.ref,
    });
  }
}