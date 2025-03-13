import * as cdk from 'aws-cdk-lib';
import { KnowledgeBaseStack } from '../lib/knowledge-base-stack';
import { LineBotStack } from '../lib/line-bot-stack';

type AppParameter = {
  knowledgeBase: KnowledgeBase,
  lineBot: LineBot,
};

type KnowledgeBase = {
  name: string,
  dataSourceWebUrls: string[],
  embeddingModelArn: string,
  inferenceModelArn: string,
  promptTemplate: string,
};

type LineBot = {
  apiEndpoint: string,
  channelSecret: string,
  channelAccessToken: string,
};

const app = new cdk.App();
const appParam = app.node.tryGetContext('knowledge-base-line-bot') as AppParameter;

const stackNamePrefix = appParam.knowledgeBase.name;

const knowledgeBase = new KnowledgeBaseStack(app, `${stackNamePrefix}KnowledgeBaseStack`, {
  knowledgeBaseName: appParam.knowledgeBase.name,
  knowledgeBaseDataSourceWebUrls: appParam.knowledgeBase.dataSourceWebUrls,
  knowledgeBaseEmbeddingModelArn: appParam.knowledgeBase.embeddingModelArn,
});

new LineBotStack(app, `${stackNamePrefix}LineBotStack`, {
  knowledgeBaseId: knowledgeBase.knowledgeBaseId,
  knowledgeBaseName: appParam.knowledgeBase.name,
  knowledgeBaseInferenceModelArn: appParam.knowledgeBase.inferenceModelArn,
  knowledgeBasePromptTemplate: appParam.knowledgeBase.promptTemplate,
  lineApiEndpoint: appParam.lineBot.apiEndpoint,
  lineChannelAccessToken: appParam.lineBot.channelAccessToken,
  lineChannelSecret: appParam.lineBot.channelSecret,
});
