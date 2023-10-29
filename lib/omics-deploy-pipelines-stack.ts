import { CfnParameter, Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';


// extend the props of the stack by adding some params
export interface OmicsDeployPipelinesStackProps extends StackProps {
  workflowsCodeRepo: codecommit.Repository;
  workflowName: string;
}

export class OmicsDeployPipelinesStack extends Stack {
  readonly environment: string;
  private workflowsCodeRepo: codecommit.Repository;
  private workflowName: string;
  constructor(scope: Construct, id: string, props: OmicsDeployPipelinesStackProps) {
    super(scope, id, props);

    //// Parameters
    //const workflowName = new CfnParameter(this, 'workflowName', {
    //  description: 'Name of the workflow',
    //  type: 'String',
    //  allowedPattern: '^[a-zA-Z0-9-]*$',
    //  minLength: 4,
    //  maxLength: 20,
    //})
    const workflowsCodeRepo = props.workflowsCodeRepo;
    const workflowName = props.workflowName;
    console.log('workflowName ---> ', workflowName);   

    // IAM Resources
    //   IAM Custom Policies
    const cdkDeployPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'sts:AssumeRole',
          'iam:PassRole',
        ],
        resources: [
          'arn:aws:iam::*:role/cdk-readOnlyRole',
          'arn:aws:iam::*:role/cdk-hnb659fds-deploy-role-*',
          'arn:aws:iam::*:role/cdk-hnb659fds-file-publishing-*'
        ]
      })],
    });

    const stepFunctCallPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'states:StartExecution',
        ],
        resources: [
          'arn:aws:states:*:*:stateMachine:omx-container-puller'
        ]
      })],
    });

    const cfnStacksPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:ListStacks',
        ],
        resources: [
          'arn:aws:cloudformation:*:*:stack/*/*'
        ]
      })],
    });

    ////   IAM Roles
    const codeBuildRole = new iam.Role(this, 'codeBuildRole', {
      roleName: 'codeBuildRole-'.concat(workflowName),
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'CodeBuild standard Role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeCommitPowerUser"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonOmicsFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess"),
      ],
      inlinePolicies: {
        CdkDeployPolicy: cdkDeployPolicy,
        StepFunctionCallPolicy: stepFunctCallPolicy,
        CfnStacksPolicy: cfnStacksPolicy,
      },
    });

    //// CodeBuild projects

    const deployProject = new codebuild.PipelineProject(this, 'deploy_project', {
      projectName: 'deploy_project-'.concat(workflowName),
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-deploy.yaml'),
      role: codeBuildRole,
      environmentVariables: {
        WFNAME: { value: workflowName },
        ACCOUNT_ID: { value: this.account },
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: false,
      },
    });

    //// Deploy Pipeline
    // Consider moving to pipeline Type V2 when supported by CNF/CDK

    const deployPipeline = new codepipeline.Pipeline(this, 'workflows_deploy_pipeline', {
      crossAccountKeys: true, // required to share artifacts accross accounts
      pipelineName: 'Build-'.concat(workflowName),
    });

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    // Build pipeline source stage

    const sourceStage = deployPipeline.addStage({
      stageName: 'Source',
    });
    
    // tried using EVENT trigger, events rule creation fails in cross-account setup
    // with error RoleArn is required for target arn:aws:events:us-east-1:xxxxxxxxxxxx:event-bus/default.
    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      repository: workflowsCodeRepo,
      output: sourceOutput,
      branch: 'main',
      codeBuildCloneOutput: true, // clone full git repo to handle tags
      trigger: codepipeline_actions.CodeCommitTrigger.POLL,
    });

    sourceStage.addAction(sourceAction);

    // Build pipeline build stage

    const buildStage = deployPipeline.addStage({
      stageName: 'Build',
    });

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'workflow_deploy_action',
      project: deployProject,
      input: sourceOutput,
      outputs: [buildOutput],
      executeBatchBuild: false,
      combineBatchBuildArtifacts: false,
    });

    buildStage.addAction(buildAction);

  }
}