#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OmicsBuildPipelinesStack } from '../lib/omics-build-pipelines-stack';
import { OmicsDeployPipelinesStack } from '../lib/omics-deploy-pipelines-stack';

const envCICD  = { account: '889574981585', region: 'us-east-1' };
const envProd = { account: '780539511692', region: 'us-east-1' };
const workflowName = 'nextflow-rnaseq';

const app = new cdk.App();
const buildStack= new OmicsBuildPipelinesStack(app, 'OmicsBuildPipelinesStack', {
 env: envCICD,
 workflowName: workflowName,
});

const deployProdStack = new OmicsDeployPipelinesStack(app, 'OmicsDeployPipelinesStack', {
  env: envProd,
  workflowName: workflowName,
  workflowsCodeRepo: buildStack.workflowsCodeRepo,
});

deployProdStack.addDependency(buildStack);
