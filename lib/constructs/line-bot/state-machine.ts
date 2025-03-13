import * as cdk from 'aws-cdk-lib';
import {
  aws_iam as iam,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

type StateMachineProps = {
  logGroupName: string,
  sessionTable: cdk.aws_dynamodb.ITable,
  knowledgeBase: StateMachineKnowledgeBaseProps,
  lineApiEndpoint: StateMachineLineApiEndpointProps,
};

type StateMachineKnowledgeBaseProps = {
  id: string,
  inferenceModelArn: string,
  promptTemplate: string,
};

type StateMachineLineApiEndpointProps = {
  url: string,
  connection: cdk.aws_events.Connection,
};

export class StateMachine extends Construct {

  public readonly stateMachine: cdk.aws_stepfunctions.StateMachine;

  constructor (scope: Construct, id: string, props: StateMachineProps){
    super(scope, id);

    const {
      logGroupName,
      sessionTable,
      knowledgeBase,
      lineApiEndpoint
    } = props;


    // -----------------------------
    // LogGroup for State Machine
    // -----------------------------
    const stateMachineLog = new cdk.aws_logs.LogGroup(this, 'StateMachineLogGroup', {
      logGroupName: `/aws/statemachine/${logGroupName}`,
      retention: cdk.aws_logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // -----------------------------
    // IAM Role for State Machine
    // -----------------------------
    const stateMachineRole = new iam.Role(this, 'StateMachineRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      inlinePolicies: {
        'policy': new iam.PolicyDocument({
          statements:[
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:PutItem',
                'dynamodb:GetItem',
              ],
              resources: [
                sessionTable.tableArn,
              ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:RetrieveAndGenerate',
                'bedrock:Retrieve',
              ],
              resources: [ '*' ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
              ],
              resources: [
                knowledgeBase.inferenceModelArn
              ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'states:InvokeHTTPEndpoint',
              ],
              resources: [ '*' ],
              conditions: {
                'StringEquals': {
                  'states:HTTPMethod': [ 'POST', ],
                  'states:HTTPEndpoint': [ lineApiEndpoint.url, ],
                }
              }
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'events:RetrieveConnectionCredentials',
              ],
              resources: [
                lineApiEndpoint.connection.connectionArn,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
              ],
              resources: [
                lineApiEndpoint.connection.connectionSecretArn,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:PutLogEvents',
              ],
              resources: [
                stateMachineLog.logGroupArn,
              ]
            }),
          ]
        }),
      }
    });

    // -----------------------------
    // Prepare for assign input
    // -----------------------------
    const taskPrepareRequest = new sfn.Pass(this, 'AssignRequest', {
      queryLanguage: sfn.QueryLanguage.JSONATA,
      assign: {
        "request": `{% $states.input %}`,
      }
    });

    // -----------------------------
    // DynamoDB - GetItem: Load Session ID
    // -----------------------------
    const taskGetSession = new tasks.DynamoGetItem(this, 'GetSession', {
      queryLanguage: sfn.QueryLanguage.JSONATA,
      table: sessionTable,
      key: {
        chat_id: tasks.DynamoAttributeValue.fromString('{% $request.chatId %}'),
      },
      outputs: `{%(
        { "sessionId": $exists($states.result.Item) ? $states.result.Item[0].session_id.S : "" }
      )%}`,
    });

    // -----------------------------
    // Format parameter for knowledgeBase:RetrieveAndGenerate
    // -----------------------------
    const taskPrepareKnowledgeBaseParameter = new sfn.Pass(this, 'PrepareKnowledgeBaseParameter', {
      queryLanguage: sfn.QueryLanguage.JSONATA,
      assign: {
        "knowledgeBaseRequestParameter": `{%(
          $arg := {
            "Input": {
              "Text": $request.message
            },
            "RetrieveAndGenerateConfiguration": {
              "Type": "KNOWLEDGE_BASE",
              "KnowledgeBaseConfiguration": {
                "KnowledgeBaseId": "${knowledgeBase.id}",
                "ModelArn": "${knowledgeBase.inferenceModelArn}",
                "RetrievalConfiguration": {
                  "VectorSearchConfiguration": {
                    "OverrideSearchType": "HYBRID",
                    "NumberOfResults": 3
                  }
                },
                "GenerationConfiguration": {
                  "PromptTemplate": {
                    "TextPromptTemplate": "${knowledgeBase.promptTemplate}"
                  },
                  "InferenceConfig": {
                    "TextInferenceConfig": {
                      "Temperature": 0,
                      "TopP": 1,
                      "MaxTokens": 2048,
                      "StopSequences": ["\nObservation"]
                    }
                  }
                },
                "OrchestrationConfiguration": {
                  "QueryTransformationConfiguration": {
                    "Type": "QUERY_DECOMPOSITION"
                  },
                  "InferenceConfig": {
                    "TextInferenceConfig": {
                      "Temperature": 0,
                      "TopP": 1,
                      "MaxTokens": 2048,
                      "StopSequences": ["\nObservation"]
                    }
                  }
                }
              }
            }
          };
          $arg := ( $states.input.sessionId != "" ? $merge([$arg, {"SessionId": $states.input.sessionId}]) : $arg );
        )%}`,
      }
    });

    // -----------------------------
    // Knowledge Bases - RetrieveAndGenerate
    // -----------------------------
    const taskRetrieveAndGenerate = new sfn.CustomState(this, 'RetrieveAndGenerate', {
      stateJson: {
        "Type": "Task",
        "Arguments": "{% $knowledgeBaseRequestParameter %}",
        "Resource": "arn:aws:states:::aws-sdk:bedrockagentruntime:retrieveAndGenerate",
        "Next": "Parallel",
        "Assign": {
          "knowledgeBaseResult": {
            "text": "{% $states.result.Output.Text %}",
            "sessionId": "{% $states.result.SessionId %}"
          }
        }
      }
    });
    // const taskRetrieveAndGenerate = new tasks.CallAwsService(this, 'RetrieveAndGenerate', {
    //   service: 'bedrock',
    //   action: 'retrieveAndGenerate',
    //   parameters: "{% $knowledgeBaseRequestParameter %}", // can not set
    //   assign: {
    //     "knowledgeBaseResult": {
    //       "text": "{% $states.result.Output.Text %}",
    //       "sessionId": "{% $states.result.SessionId %}"
    //     },
    //   },
    //   iamResources: ['*'],
    // });

    // -----------------------------
    // HTTP API Invoke - Respond to LINE
    // -----------------------------
    const taskSendResponse = new sfn.CustomState(this, 'SendResponse', {
      stateJson: {
        "Type": "Task",
        "Resource": "arn:aws:states:::http:invoke",
        "Arguments": {
          "ApiEndpoint": lineApiEndpoint.url,
          "Method": "POST",
          "RequestBody": {
            "replyToken": "{% $request.replyToken %}",
            "messages": [
              {
                "type": "text",
                "text": "{% $knowledgeBaseResult.text %}"
              }
            ]
          },
          "Authentication": {
            "ConnectionArn": lineApiEndpoint.connection.connectionArn
          }
        },
        "Retry": [
          {
            "ErrorEquals": [
              "States.ALL"
            ],
            "BackoffRate": 2,
            "IntervalSeconds": 1,
            "MaxAttempts": 3,
            "JitterStrategy": "FULL"
          }
        ],
        "End": true,
      }
    });

    // -----------------------------
    // DynamoDB - PutItem: Store Session ID
    // -----------------------------
    const taskPutSession = new tasks.DynamoPutItem(this, 'PutSession', {
      queryLanguage: sfn.QueryLanguage.JSONATA,
      table: sessionTable,
      item: {
        chat_id: tasks.DynamoAttributeValue.fromString('{% $request.chatId %}'),
        session_id: tasks.DynamoAttributeValue.fromString('{% $knowledgeBaseResult.sessionId %}'),
        ttl: tasks.DynamoAttributeValue.numberFromString('{% $string($floor(($toMillis($now()) + 22*60*60*1000) / 1000)) %}'),
      },
    });

    const taskParallel = new sfn.Parallel(this, 'Parallel')
      .branch(taskSendResponse)
      .branch(taskPutSession)
      .next(new sfn.Succeed(this, 'Success'));

    // -----------------------------
    // State Machine
    // -----------------------------
    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      stateMachineType: sfn.StateMachineType.EXPRESS,
      queryLanguage: sfn.QueryLanguage.JSONATA,
      role: stateMachineRole,
      definitionBody: sfn.DefinitionBody.fromChainable(
        taskPrepareRequest
          .next(taskGetSession)
          .next(taskPrepareKnowledgeBaseParameter)
          .next(taskRetrieveAndGenerate)
          .next(taskParallel)
      ),
      timeout: cdk.Duration.seconds(27),
      logs: {
        destination: stateMachineLog,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: false,
    });

    this.stateMachine = stateMachine;

    // -----------------------------
    // Output
    // -----------------------------
    new cdk.CfnOutput(this, 'OutputStateMachineName', {
      description: 'State Machine Name',
      value: stateMachine.stateMachineName,
    });
  }
}