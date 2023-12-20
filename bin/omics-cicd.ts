#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OmicsCicdStack } from '../lib/omics-cicd-stack';
import { OmicsDeployResourcesStack } from '../lib/omics-deploy-resources-stack';


const envCICD = { account: '968038207812', region: 'us-east-1' };
const envTest = { account: '523155489867', region: 'us-east-1' };
const envPro = { account: '691366922852', region: 'us-east-1' };
const workflowName = 'nextflow-rnaseq';
const projectBranch = 'main';
const buildRoleName = 'codeBuildRole-'+workflowName;

const app = new cdk.App();

const testEnvResourcesStack = new OmicsDeployResourcesStack(app, 'testSupportResourcesStack', {
  env: envPro,
  workflowName: workflowName,
  buildRoleName: buildRoleName,
  cicdEnv: { name: "CICD", env: envCICD }
});

// Stack for CICD resources, including pipeline
const cicdEnvResourcesStack = new OmicsCicdStack(app, 'OmicsCicdStack', {
  env: envCICD,
  workflowName: workflowName,
  projectBranch: projectBranch,
  cicdEnv: { name: "cicd", env: envCICD },
  buildRoleName: buildRoleName,
  deployEnv: { name: "test", env: envTest },
  deployBucket: testEnvResourcesStack.deployBucket
});

testEnvResourcesStack.addDependency(cicdEnvResourcesStack);