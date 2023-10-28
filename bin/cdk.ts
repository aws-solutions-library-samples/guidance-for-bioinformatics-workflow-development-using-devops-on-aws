#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OmicsPipelinesStack } from '../lib/omics-pipelines-stack';

const envCICD  = { account: 'xxxxxxxxxxxx', region: 'us-east-1' };
const envProd = { account: 'xxxxxxxxxxxx', region: 'us-east-1' };

const app = new cdk.App();
new OmicsPipelinesStack(app, 'OmicsPipelinesStack', {
 env: envCICD
});



