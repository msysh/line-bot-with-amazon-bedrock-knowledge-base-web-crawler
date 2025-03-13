import * as cdk from 'aws-cdk-lib';
import {
  aws_events as events,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

type LineEndpointConnectionProps = {
  lineChannelAccessToken: string,
}

export class LineEndpointConnection extends Construct {

  public readonly connection: events.Connection;

  constructor (scope: Construct, id: string, props: LineEndpointConnectionProps){
    super(scope, id);

    const { lineChannelAccessToken } = props;

    // -----------------------------
    // Line Endpoint Connection
    // -----------------------------
    const connection = new events.Connection(this, 'LineEndpointConnection', {
      authorization: events.Authorization.apiKey(
        'Authorization',
        cdk.SecretValue.unsafePlainText(`Bearer ${lineChannelAccessToken}`)
      ),
    });

    this.connection = connection;
  }
}