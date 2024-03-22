#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OmicsCommonCicdStack } from '../lib/omics-cicd-stack-common';
import { OmicsCicdPerWorkflowStack } from '../lib/omics-cicd-stack-per-workflow';
//import { OmicsDeployPerWorkflowResourcesStack } from '../lib/omics-deploy-per-workflow-resources-stack';
import { OmicsDeployCommonResourcesStack } from '../lib/omics-deploy-common-resources-stack';

const app = new cdk.App();

const envCICD = { account: app.node.tryGetContext('cicd_account'), region: app.node.tryGetContext('aws_region') };
const envTest = { account: app.node.tryGetContext('test_account'), region: app.node.tryGetContext('aws_region') };
const envProd = { account: app.node.tryGetContext('prod_account'), region: app.node.tryGetContext('aws_region') };

const projectBranch = 'main';
const workflowNames = app.node.tryGetContext('workflows');
const sourceDataS3URIs = app.node.tryGetContext('source_data_s3_uris');
const buildRoleName = 'omicsCiCdCodeBuildRole';

// Stacks for common resources
const deployCommonResourcesStack = new OmicsDeployCommonResourcesStack(app, 'OmicsDeployCommonResourcesStack', {
  env: envProd,
  buildRoleName: buildRoleName,
  cicdEnv: { name: "CICD", env: envCICD }
});

const cicdCommonResourcesStack = new OmicsCommonCicdStack(app, 'OmicsCicdCommonStack', {
  env: envCICD,
  cicdEnv: { name: "cicd", env: envCICD },
  buildRoleName: buildRoleName,
  deployEnv: { name: "test", env: envTest },
  deployBucket: deployCommonResourcesStack.deployBucket,
  sourceDataS3URIs: sourceDataS3URIs,
});
cicdCommonResourcesStack.addDependency(deployCommonResourcesStack);

Object.keys(workflowNames).forEach(key => {
  console.log(key, workflowNames[key]);

  // Stack for workflow specific deploy resources 
  /*
  const deployPerWorkflowResourcesStack = new OmicsDeployPerWorkflowResourcesStack(app, `OmicsDeployPerWorkflowResourcesStack-${key}`, {
    env: envProd,
    workflowName: key,
    runReleaseBuildLambdaRole: deployCommonResourcesStack.runReleaseBuildLambdaRole,
    cicdEnv: { name: "CICD", env: envCICD },
    deployBucket: deployCommonResourcesStack.deployBucket,
    deployRole: deployCommonResourcesStack.deployRole
  });
  deployPerWorkflowResourcesStack.addDependency(deployCommonResourcesStack);
  */
  // Stack for workflow specific CICD resources
  const cicdPerWorkflowResourcesStack = new OmicsCicdPerWorkflowStack(app, `OmicsCicdPerWorkflowStack-${key}`, {
    env: envCICD,
    workflowName: key,
    workflowCodeRepo: workflowNames[key],
    projectBranch: projectBranch,
    cicdEnv: { name: "cicd", env: envCICD },
    buildRoleName: buildRoleName,
    deployEnv: { name: "test", env: envTest },
    deployBucket: deployCommonResourcesStack.deployBucket,
    prodAccountId: envProd.account,
    codePipelineRole: cicdCommonResourcesStack.codePipelineRole
  });
  cicdPerWorkflowResourcesStack.addDependency(cicdCommonResourcesStack);

});