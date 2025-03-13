import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { ServiceRoles } from './constructs/knowledge-base/service-roles';
import { OpenSearchCollection } from './constructs/knowledge-base/opensearch-collection';
import { OpenSearchPolicies } from './constructs/knowledge-base/opensearch-policies';
import { CustomResourceAossIndex } from './constructs/knowledge-base/custom-resource-aoss-index';
import { KnowledgeBase } from './constructs/knowledge-base/knowledge-base';

type KnowledgeBaseStackProps = cdk.StackProps & {
  knowledgeBaseName: string,
  knowledgeBaseDataSourceWebUrls: string[],
  knowledgeBaseEmbeddingModelArn: string,
};

export class KnowledgeBaseStack extends cdk.Stack {

  public readonly knowledgeBase: KnowledgeBase;
  public readonly knowledgeBaseId: string;

  constructor(scope: Construct, id: string, props: KnowledgeBaseStackProps) {
    super(scope, id, props);

    const knowledgeBaseName = props.knowledgeBaseName.toLowerCase();
    const knowledgeBaseDataSourceWebUrls = props.knowledgeBaseDataSourceWebUrls;
    const knowledgeBaseEmbeddingModelArn = props.knowledgeBaseEmbeddingModelArn;

    const aossCollectionName = knowledgeBaseName;
    const vectorIndexName = `${knowledgeBaseName}-index`;

    const region = this.region;
    const account = this.account;

    // -----------------------------
    // Amazon OpenSearch Serverless Collection
    // -----------------------------
    const collection = new OpenSearchCollection(this, 'OpenSearchCollection', {
      aossCollectionName: aossCollectionName,
    });

    // -----------------------------
    // Service Roles (for CustomResource Lambda and KnowledgeBases)
    // -----------------------------
    const serviceRoles = new ServiceRoles(this, 'ServiceRoles', {
      account: account,
      region: region,
      aossCollection: collection.collection,
    })

    // -----------------------------
    // AOSS Policies
    // -----------------------------
    const aossPolicies = new OpenSearchPolicies(this, 'OpenSearchPolicies', {
      account: account,
      aossCollection: collection.collection,
      createIndexCustomResourceRole: serviceRoles.createIndexCustomResourceRole,
      knowledgeBaseServiceRole: serviceRoles.knowledgeBaseServiceRole
    });
    collection.collection.addDependency(aossPolicies.encryptionPolicy);

    // -----------------------------
    // AOSS Index by Custom Resource
    // -----------------------------
    const aossIndex = new CustomResourceAossIndex(this, 'CustomResourceAossIndex', {
      aossCollection: collection.collection,
      aossIndexName: vectorIndexName,
      customResourceLambdaFunctionRole: serviceRoles.createIndexCustomResourceRole,
    });
    aossIndex.customResource.node.addDependency(aossPolicies.networkPolicy);
    aossIndex.customResource.node.addDependency(aossPolicies.accessPolicy);
    aossIndex.customResource.node.addDependency(collection.collection);

    // -----------------------------
    // Knowledge Base
    // -----------------------------
    const knowledgeBase = new KnowledgeBase(this, 'KnowledgeBase', {
      collection: collection,
      vectorIndexName: vectorIndexName,
      knowledgeBaseName: knowledgeBaseName,
      knowledgeBaseDataSourceWebUrls: knowledgeBaseDataSourceWebUrls,
      knowledgeBaseEmbeddingModelArn: knowledgeBaseEmbeddingModelArn,
      knowledgeBaseServiceRole: serviceRoles.knowledgeBaseServiceRole,
      aossIndexForDepends: aossIndex.customResource,
    });
    knowledgeBase.knowledgeBase.addDependency(aossIndex.customResource.node.defaultChild as cdk.CfnCustomResource);

    this.knowledgeBase = knowledgeBase;
    this.knowledgeBaseId = knowledgeBase.knowledgeBase.attrKnowledgeBaseId;
  }
}
