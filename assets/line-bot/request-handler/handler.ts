import * as crypto from 'crypto';
import {
  APIGatewayProxyHandlerV2,
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';
import {
  SFNClient,
  StartExecutionCommand,
} from '@aws-sdk/client-sfn';

import * as line from '@line/bot-sdk';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!;
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
});
line.middleware({
  channelSecret: LINE_CHANNEL_SECRET
});

const sfnClient = new SFNClient({});

const getLineSignature = (headers: any): string => {
  if ('x-line-signature' in headers){
    return headers['x-line-signature']!;
  }
  else if ('X-Line-Signature' in headers){
    return headers['X-Line-Signature']!;
  }
  else{
    return '';
  }
};

// -----------------------------
// Line Webhook Event Handler
// -----------------------------
const eventHandler = async (event: line.WebhookEvent): Promise<any> => {

  if (event.type !== 'message') {
    console.warn('event.type is not "message"');
    throw new Error('event.type is not "message"');
  }

  const messageEvent = event as line.MessageEvent;
  const messageType = messageEvent.message.type;
  const messageId = messageEvent.message.id;
  const userId = messageEvent.source.userId;
  const groupId = messageEvent.source.type === 'group' ? messageEvent.source.groupId : userId!;
  const replyToken = messageEvent.replyToken;
  const quoteToken = 'quoteToken' in messageEvent.message ? messageEvent.message.quoteToken : '';
  const timestamp = messageEvent.timestamp;

  const chatId = crypto.createHash('sha256').update(groupId).digest('hex');

  await lineClient.showLoadingAnimation({
    chatId: groupId,
    loadingSeconds: 60,
  });

  if (messageType !== 'text') {
    const replyMessage: line.messagingApi.ReplyMessageRequest = {
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'テキスト以外は受け付けられません' }],
    }
    await lineClient.replyMessage(replyMessage);
    return;
  }

  const user: line.messagingApi.UserProfileResponse = await lineClient.getProfile(userId!);

  let message = (event.message as line.TextEventMessage).text;
  let request = {
    messageId: messageId,
    chatId: chatId,
    userId: userId,
    groupId: groupId,
    replyToken: replyToken,
    quoteToken: quoteToken,
    timestamp: timestamp,
    userName: user.displayName,
    message: message,
  }
  console.debug(request);

  const response = await sfnClient.send(new StartExecutionCommand({
    stateMachineArn: STATE_MACHINE_ARN,
    input: JSON.stringify(request),
    name: messageId,
  }));
  console.debug(response);

  return response;
};

// -----------------------------
// Lambda Function Request Handler
// -----------------------------
export const handler: APIGatewayProxyHandlerV2 = async (event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> => {
  console.debug(event);

  const signature = getLineSignature(event.headers!);
  if (!line.validateSignature(event.body!, LINE_CHANNEL_SECRET, signature)) {
    throw new line.SignatureValidationFailed('signature validation failed', { signature });
  }

  const body: line.WebhookRequestBody = JSON.parse(event.body!);

  const request = await Promise
    .all(body.events.map( async e => eventHandler(e)))
    .catch( err => {
      console.error(err.Message);
      return {
        statusCode: 500,
        body: 'Error'
      }
    });

  console.debug(request);
  return {
    statusCode: 201,
    body: JSON.stringify(request),
  };
};
