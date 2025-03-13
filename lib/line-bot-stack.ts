import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { SessionDatabase } from './constructs/line-bot/session-database';
import { LineEndpointConnection } from './constructs/line-bot/line-endpoint-connection';
import { StateMachine } from './constructs/line-bot/state-machine';
import { RequestHandler } from './constructs/line-bot/request-handler';
import { ApiGateway } from './constructs/line-bot/apigateway';

type LineBotStackProps = cdk.StackProps & {
  knowledgeBaseId: string,
  knowledgeBaseName: string,
  knowledgeBaseInferenceModelArn: string,
  knowledgeBasePromptTemplate: string,
  lineApiEndpoint: string,
  lineChannelAccessToken: string,
  lineChannelSecret: string,
};

export class LineBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LineBotStackProps) {
    super(scope, id, props);

    const knowledgeBaseId = props.knowledgeBaseId;
    const knowledgeBaseName = props.knowledgeBaseName;
    const knowledgeBaseInferenceModelArn = props.knowledgeBaseInferenceModelArn;
    const knowledgeBasePromptTemplate = props.knowledgeBasePromptTemplate;
    const lineApiEndpoint = props.lineApiEndpoint;
    const lineChannelAccessToken = props.lineChannelAccessToken;
    const lineChannelSecret = props.lineChannelSecret;

    // -----------------------------
    // DynamoDB Table for Session
    // -----------------------------
    const sessionDatabase = new SessionDatabase(this, 'SessionDatabase');

    // -----------------------------
    // Line Endpoint Connection
    // -----------------------------
    const lineEndpointConnection = new LineEndpointConnection(this, 'LineEndpointConnection', {
      lineChannelAccessToken: lineChannelAccessToken,
    });

    // -----------------------------
    // State Machine
    // -----------------------------
    const stateMachine = new StateMachine(this, 'StateMachine', {
      logGroupName: knowledgeBaseName,
      sessionTable: sessionDatabase.table,
      knowledgeBase: {
        id: knowledgeBaseId,
        inferenceModelArn: knowledgeBaseInferenceModelArn,
        promptTemplate: knowledgeBasePromptTemplate,
      },
      lineApiEndpoint: {
        url: lineApiEndpoint,
        connection: lineEndpointConnection.connection,
      }
    });

    // -----------------------------
    // Request Handler
    // -----------------------------
    const requestHandler = new RequestHandler(this, 'RequestHandler', {
      stateMachine: stateMachine.stateMachine,
      lineChannelAccessToken: lineChannelAccessToken,
      lineChannelSecret: lineChannelSecret,
    });

    // -----------------------------
    // HTTP API Gateway
    // -----------------------------
    const apiGateway = new ApiGateway(this, 'ApiGateway', {
      logGroupName: knowledgeBaseName,
      requestHandler: requestHandler.lambdaFunction,
    });
  }
};