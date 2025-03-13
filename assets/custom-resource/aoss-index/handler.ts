import {
  Context,
  CloudFormationCustomResourceResourcePropertiesCommon,
  CdkCustomResourceHandler,
  CdkCustomResourceEvent,
  CdkCustomResourceResponse,
} from 'aws-lambda';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer }  from '@opensearch-project/opensearch/aws';

type Properties = CloudFormationCustomResourceResourcePropertiesCommon & {
  collectionEndpoint: string,
  collectionName: string,
  indexName: string,
};

export const handler: CdkCustomResourceHandler = async (event: CdkCustomResourceEvent, context: Context) => {
  console.debug(event);

  const props = event.ResourceProperties as Properties;

  await new Promise(resolve => setTimeout(resolve, 30000));

  const client = new Client({
    ...AwsSigv4Signer({
      region: process.env.AWS_REGION!,
      service: 'aoss',
      getCredentials: () => {
        const credentialsProvider = defaultProvider();
        return credentialsProvider();
      },
    }),
    node: props.collectionEndpoint,
  });

  switch (event.RequestType) {
    case 'Create':
      return await onCreate(client, event);

    case 'Update':
      return await onUpdate(client, event.PhysicalResourceId, event);

    case 'Delete':
      return await onDelete(client, event.PhysicalResourceId, event);

    default:
      throw new Error('Failed');
  }
};

const onCreate = async (client: Client, event: CdkCustomResourceEvent) => {
  const id = event.RequestId;
  const props = event.ResourceProperties as Properties;
  const returnValue: CdkCustomResourceResponse = {
    PhysicalResourceId: id,
    Data: {},
    Reason: '',
    NoEcho: true,
  };

  const settings = {
    settings: {
      index: {
        number_of_shards: 4,
        number_of_replicas: 1,
      },
    },
  };

  const resCreate = await backoff(async () => {
    const response = await client.indices.create({
      index: props.indexName,
      body: settings,
    });
    console.debug(response);
    return response;
  });

  const resMapping = await backoff(async () => {
    const response = await client.indices.putMapping({
      index: props.indexName,
      body: {
        "dynamic_templates": [
          {
            "strings": {
              "match_mapping_type": "string",
              "mapping": {
                "fields": {
                  "keyword": {
                    "ignore_above": 2147483647,
                    "type": "keyword"
                  }
                },
                "type": "text"
              }
            }
          }
        ],
        "properties": {
          "metadata": {
            "type": "text",
            "index": false
          },
          "text": {
            "type": "text"
          },
          "vector": {
            "type": "knn_vector",
            "dimension": 1024,
            "method": {
              "engine": "faiss",
              "space_type": "l2",
              "name": "hnsw",
              "parameters": {}
            }
          }
        }
      }
    });
    console.debug(response);
    return response;
  }, {
    maxAttempts: 1,
  });

  returnValue.Data = {
    resCreate,
    resMapping,
  };

  console.debug(returnValue.Data);
  return returnValue;
};

const onUpdate = async (client: Client, physicalResourceId: string, event: CdkCustomResourceEvent) => {

  const returnValue: CdkCustomResourceResponse = {
    PhysicalResourceId: physicalResourceId,
    Data: {},
    Reason: '',
    NoEcho: true,
  };
  return returnValue;
};

const onDelete = async (client: Client, physicalResourceId: string, event: CdkCustomResourceEvent) => {

  const returnValue: CdkCustomResourceResponse = {
    PhysicalResourceId: physicalResourceId,
    Data: {},
    Reason: '',
    NoEcho: true,
  };
  // const resDelete = await client.indices.delete({
  //   index: props.indexName,
  // });
  // console.info(resDelete);
  // returnValue.Data = resDelete;
  return returnValue;
};

type BackoffOptions = {
  maxAttempts: number,
  initialDelay: number,
  maxDelay: number,
  jitter: boolean,
};

async function backoff<T>(fn: () => Promise<T>, options: Partial<BackoffOptions> = {}): Promise<T>{
  const {
    maxAttempts = 3,
    initialDelay = 10000,
    maxDelay = 30000,
    jitter = true
  } = options;

  let attempt = 0;

  while (true) {
    try {
      return await fn();
    }
    catch (error) {
      console.warn(`Attempt: ${attempt} (error: ${error})`);
      attempt ++;

      if (attempt >= maxAttempts) {
        throw error;
      }

      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      const jitterDelay = jitter ? delay * (0.5 + Math.random()) : delay;
      console.info(`Retrying after ${jitterDelay}ms...`);

      await new Promise(resolve => setTimeout(resolve, jitterDelay));
    }
  }
};