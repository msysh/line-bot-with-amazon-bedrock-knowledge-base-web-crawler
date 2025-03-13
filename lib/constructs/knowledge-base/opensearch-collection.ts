import * as cdk from 'aws-cdk-lib';
import {
  aws_opensearchserverless as aoss,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

type OpenSearchCollectionProps = {
  aossCollectionName: string,
};

export class OpenSearchCollection extends Construct {

  public readonly collection: aoss.CfnCollection;

  constructor (scope: Construct, id: string, props: OpenSearchCollectionProps){
    super(scope, id);

    const collectionName = props.aossCollectionName;

    // -----------------------------
    // Amazon OpenSearch Serverless Collection
    // -----------------------------
    const collection = new aoss.CfnCollection(this, 'Collection', {
      name: collectionName,
      type: 'VECTORSEARCH',
      standbyReplicas: 'DISABLED',
    });

    this.collection= collection;
  }
}