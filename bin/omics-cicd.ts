#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OmicsCicdPerWorkflowStack } from '../lib/omics-cicd-stack-per-workflow';
import { OmicsDeployResourcesStack } from '../lib/omics-deploy-resources-stack';
import { OmicsCommonCicdStack } from '../lib/omics-cicd-stack-common';

const app = new cdk.App();

const envCICD = { account: app.node.tryGetContext('cicd_account'), region: app.node.tryGetContext('aws_region') };
const envTest = { account: app.node.tryGetContext('test_account'), region: app.node.tryGetContext('aws_region') };
const envProd = { account: app.node.tryGetContext('prod_account'), region: app.node.tryGetContext('aws_region') };
// const workflowName = 'nextflow-rnaseq';
const projectBranch = 'main';
const workflowNames = app.node.tryGetContext('workflows');
const buildRoleName = 'omicsCiCdCodeBuildRole';

Object.keys(workflowNames).forEach(key => {
  console.log(key, workflowNames[key]);
  
  const testEnvResourcesStack = new OmicsDeployResourcesStack(app, 'testSupportResourcesStack', {
    env: envProd,
    workflowName: key,
    buildRoleName: buildRoleName,
    cicdEnv: { name: "CICD", env: envCICD }
  });

  // Stack for common CICD resources
  const cicdCommonResourcesStack = new OmicsCommonCicdStack(app, 'OmicsCicdCommonStack', {
    env: envCICD,
    cicdEnv: { name: "cicd", env: envCICD },
    buildRoleName: buildRoleName,
    deployEnv: { name: "test", env: envTest },
    deployBucket: testEnvResourcesStack.deployBucket
  });

  // Stack for workflow specific CICD resources
  const cicdPerWorkflowResourcesStack = new OmicsCicdPerWorkflowStack(app, 'OmicsCicdPerWorkflowStack', {
    env: envCICD,
    workflowName: key,
    workflowCodeRepo: workflowNames[key],
    projectBranch: projectBranch,
    cicdEnv: { name: "cicd", env: envCICD },
    buildRoleName: buildRoleName,
    deployEnv: { name: "test", env: envTest },
    deployBucket: testEnvResourcesStack.deployBucket,
    codePipelineRole: cicdCommonResourcesStack.codePipelineRole
  });

  cicdPerWorkflowResourcesStack.addDependency(cicdCommonResourcesStack);
  testEnvResourcesStack.addDependency(cicdPerWorkflowResourcesStack);
});