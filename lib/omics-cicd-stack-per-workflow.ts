import { Stack, StackProps, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import { DeployEnvironment } from "../types";
import * as path from 'path';
import * as fs from "fs";


// extend the props of the stack by adding some params
export interface OmicsCicdPerWorkflowStackProps extends StackProps {
  workflowName: string,
  workflowCodeRepo: string,
  projectBranch: string,
  cicdEnv: DeployEnvironment,
  buildRoleName: string,
  deployEnv: DeployEnvironment,
  deployBucket: s3.Bucket,
  prodAccountId: string,
  codePipelineRole: iam.Role
}

export class OmicsCicdPerWorkflowStack extends Stack {
  public readonly crossAccountRole: iam.Role;
  public readonly deployRole: iam.Role;
  public readonly pipelineKey: kms.Key;
  public readonly workflowsCodeRepo: codecommit.Repository;
  constructor(scope: Construct, id: string, props: OmicsCicdPerWorkflowStackProps) {
    super(scope, id, props);


    //// Git repositories

    //this.workflowsCodeRepo = new codecommit.Repository(this, 'workflows_code_git', {
    //  repositoryName: `healthomics-${props.workflowName}-workflow`,
      //repositoryName: 'healthomics-workflow',
    //  code: codecommit.Code.fromDirectory(path.join(__dirname, '../project/'), props.projectBranch),
    //  description: `HealthOmics Workflows Git Repository for ${props.workflowName} workflow.`,
    //})
    const testFilesBucketName = Fn.importValue('OmicsCicdTestDataBucket');

    //// CodeBuild Projects
    // Build Project
    const codeBuildRole = iam.Role.fromRoleArn(
      this, 'OmicsCicdCodeBuildRole', Fn.importValue('OmicsCicdCodeBuildRole'));

    const buildProject = new codebuild.PipelineProject(this, 'build_project', {
      projectName: `build_project-${props.workflowName}`,
      role: codeBuildRole,
      buildSpec: codebuild.BuildSpec.fromAsset('cicd/buildspec-build.yaml'),
      environmentVariables: {
        WFNAME: { value: props.workflowName },
        ACCOUNT_ID: { value: this.account },
        TESTBUCKET: { value: testFilesBucketName }
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: false,
      },
    });

    // Deploy Project
    const deployProject = new codebuild.PipelineProject(this, 'deploy_project', {
      projectName: `deploy_project-${props.workflowName}`,
      role: codeBuildRole,
      buildSpec: codebuild.BuildSpec.fromAsset('cicd/buildspec-deploy-artifact.yaml'),
      environmentVariables: {
        WFNAME: { value: props.workflowName },
        BRANCH: { value: props.projectBranch },
        DEPLOY_ACCOUNT_ID: { value: props.prodAccountId },
        DEPLOYBUCKET: { value: props.deployBucket.bucketName },
        TESTBUCKET: { value: testFilesBucketName }
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: false,
      },
    });

    // Dynamic Tests Project
    

    const omicsTesterRole = iam.Role.fromRoleArn(
      this, 'OmicsTesterRole', Fn.importValue('OmicsTesterRole'));

    // const testProject = new codebuild.PipelineProject(this, 'test_project', {
    //   projectName: 'test_project-'.concat(props.workflowName),
    //   role: codeBuildRole,
    //   buildSpec: codebuild.BuildSpec.fromAsset('cicd/buildspec-test.yaml'),
    //   environmentVariables: {
    //     WFNAME: { value: props.workflowName },
    //     ACCOUNT_ID: { value: this.account },
    //     TESTS_BUCKET_NAME: { value: Fn.importValue('OmicsCicdTestDataBucket') },
    //     OMICS_TESTER_ROLE_ARN: { value: omicsTesterRole.roleArn }
    //   },
    //   environment: {
    //     buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
    //     privileged: false,
    //   },
    // });


    // Function to run Health Omics workflow and wait for success/failure
    const stateMachineDefinitionJsonFile = fs.readFileSync(path.resolve(__dirname, '../step_function/healthomics_workflow_state_machine.json'))
    
    const runHealthOmicsStateMachineRole = iam.Role.fromRoleArn(
      this, 'runHealthOmicsStateMachineRole', Fn.importValue('HealthOmicsStateMachineRole'));
    const omicsWorkflowStateMachine = new sfn.CfnStateMachine(this, `test-healthomics-sfn-${props.workflowName}`, {
      roleArn: runHealthOmicsStateMachineRole.roleArn,
      stateMachineName: `test-healthomics-sfn-${props.workflowName}`,
      definitionString: stateMachineDefinitionJsonFile.toString(),
      definitionSubstitutions: {
        "HealthOmicsWorkflowLambdaName": "runHealthOmicsWorkflow",
        "HealthOmicsWorkflowJobRole": omicsTesterRole.roleArn,
        "HealthOmicsWorkflowOutputS3": `s3://${testFilesBucketName}/${props.workflowName}/output`,
        "HealthOmicsWorkflowStagingS3": `s3://${testFilesBucketName}/${props.workflowName}/staging`,
        "HealthOmicsWorkflowParamsFile": `test.parameters.json`
      }
    });
    const stateMachineObject = sfn.StateMachine.fromStateMachineName(this, `sfnId-${props.workflowName}`, `test-healthomics-sfn-${props.workflowName}`);
    //// Pipelines

    // Pipeline artifacts
    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    // Build Pipeline
    // Consider moving to pipeline Type V2 when supported by CNF/CDK
    //const codePipelineRole = iam.Role.fromRoleArn(
    //  this, 'OmicsCicdCodePipelineRole', Fn.importValue('OmicsCicdCodePipelineRole'));

    const buildPipeline = new codepipeline.Pipeline(this, 'workflows_build_pipeline', {
      //artifactBucket: artifactBucket,
      crossAccountKeys: true, // required to share artifacts accross accounts
      pipelineName: `Pipeline-${props.workflowName}`,
      role: props.codePipelineRole
    });
    // Pipeline Stages
    // Pipeline source stage

    const sourceRepo = codecommit.Repository.fromRepositoryName(this, `CodeCommitRepo-${props.workflowName}`, props.workflowCodeRepo);
    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      repository: sourceRepo,
      output: sourceOutput,
      branch: `${props.projectBranch}`,
      codeBuildCloneOutput: true, // clone full git repo to handle tags
      trigger: codepipeline_actions.CodeCommitTrigger.EVENTS,
    });

    const sourceStage = buildPipeline.addStage({
      stageName: 'Source',
    });
    sourceStage.addAction(sourceAction);

    // Pipeline build stage
    const buildStage = buildPipeline.addStage({
      stageName: 'Build',
    });

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'workflow_build_action',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
      executeBatchBuild: false,
      combineBatchBuildArtifacts: false,
    });

    buildStage.addAction(buildAction);


    // Pipeline test stage
    //const testAction = new codepipeline_actions.CodeBuildAction({
    //  actionName: 'workflow_test_action',
    //  project: testProject,
    //  input: sourceOutput,
    //  environmentVariables: {
    //    WFNAME: { value: props.workflowName },
    //    ACCOUNT_ID: { value: props.cicdEnv.env.account },
    //    TESTS_BUCKET_NAME: { value: testFilesBucket.bucketName },
    //    OMICS_TESTER_ROLE_ARN: { value: omicsTesterRole.roleArn }
    //  }, extraInputs: [buildOutput],
    //  outputs: [new codepipeline.Artifact()],
    //  executeBatchBuild: false,
    //  combineBatchBuildArtifacts: false,
    //});

    // Pipeline test stage
    const testStage = buildPipeline.addStage({
      stageName: 'Test',
    });
    const testAction = new codepipeline_actions.StepFunctionInvokeAction({
      actionName: 'Invoke',
      stateMachine: stateMachineObject,
      stateMachineInput: codepipeline_actions.StateMachineInput.filePath(buildOutput.atPath('workflow.json')),
    });

    testStage.addAction(testAction);

    // Build pipeline approval stage

    const approveStage = buildPipeline.addStage({ stageName: 'Approve' });
    const manualApprovalAction = new codepipeline_actions.ManualApprovalAction({
      actionName: 'Approve',
      additionalInformation: 'Approve this version to be deployed in production.',
      notificationTopic: new sns.Topic(this, 'Topic'), // optional
      notifyEmails: [
        'some_email@example.com',
      ], // configure your email here
    });

    approveStage.addAction(manualApprovalAction);

    // Build pipeline Deploy Stage

    const deployStage = buildPipeline.addStage({
      stageName: 'Deploy',
    });

    const deployAction = new codepipeline_actions.CodeBuildAction({
      actionName: `workflow_deploy_action-${props.workflowName}`,
      project: deployProject,
      input: sourceOutput,
      extraInputs: [buildOutput],
      executeBatchBuild: false,
      combineBatchBuildArtifacts: false,
    });

    deployStage.addAction(deployAction);
  }
};