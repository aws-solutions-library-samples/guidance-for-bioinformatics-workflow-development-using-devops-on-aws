import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as path from 'path';


export class OmicsPipelinesStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Git repositories

    const workflowsCodeRepo = new codecommit.Repository(this, 'workflows_code_git', {
      repositoryName: 'healthomics-workflows',
      code: codecommit.Code.fromDirectory(path.join(__dirname, '../project/'), 'main'),
    })

    // ECR Repository

    const ecrRepo = new ecr.Repository(this, 'healthomics_ecr', {
      repositoryName: 'healthomics-repo',
      removalPolicy: RemovalPolicy.DESTROY, //change if you want to retain the repo
    });

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
    
    //   IAM Roles

    const codeBuildRole = new iam.Role(this, 'codeBuildRole', {
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


    // CodeBuild projects

    const buildProject = new codebuild.PipelineProject(this, 'build_project', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-build.yaml'),
      role: codeBuildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: true, // needed to connect to the Docker daemon for building the image
      },
    });

    const testProject = new codebuild.PipelineProject(this, 'test_project', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-test.yaml'),
      role: codeBuildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: true, // needed to connect to the Docker daemon for building the image
      },
    });

    const uploadProject = new codebuild.PipelineProject(this, 'upload_project', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-upload.yaml'),
      role: codeBuildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: true, // needed to connect to the Docker daemon for building the image
      },
    });



    // Should we use 3 pipelines?
    //  - 1: Deploy Pipeline for CICD elements (buld, deploy pipelines)
    //  - 2: Build Pipeline for building and testing of healthomics workflows
    //  - 3: Deploy Pipeline for healthomics workflows
    // We'd rather use 2 pipelines:
    //  - 1: Build pipeline, dynamic, using build definition from repo https://medium.com/andy-le/building-a-dynamic-aws-pipeline-with-cdk-5d5426fc0493
    //  - 2: Deploy pipeline


    //// Build Pipeline (1)

    const buildPipeline = new codepipeline.Pipeline(this, 'workflows_build_pipeline', {
      crossAccountKeys: false, // so no AWS KMS CMK is created
      pipelineName: 'Build',
    });

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    // Build pipeline stages

    // Build pipeline source stage

    const sourceStage = buildPipeline.addStage({
      stageName: 'Source',
    });

    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      repository: workflowsCodeRepo,
      output: sourceOutput,
      branch: 'main',
      codeBuildCloneOutput: true, // clone full git repo to handle tags
      trigger: codepipeline_actions.CodeCommitTrigger.EVENTS,
    });

    sourceStage.addAction(sourceAction);
    
    // Build pipeline build stage

    const buildStage = buildPipeline.addStage({
      stageName: 'Build',
    });

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'workflows_build_action',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
      executeBatchBuild: false, 
      combineBatchBuildArtifacts: false,
    });

    buildStage.addAction(buildAction);

    // Build pipeline test stage
    // TODO: run workflow (faster in build server, or in healthomics much slower but closer to actual env)

    const testStage = buildPipeline.addStage({
      stageName: 'Test',
    });

    const testAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'workflows_test_action',
      project: testProject,
      input: sourceOutput,
      extraInputs: [buildOutput],
      outputs: [new codepipeline.Artifact()], // optional
      executeBatchBuild: false, // optional, defaults to false
      combineBatchBuildArtifacts: false, // optional, defaults to false
      //role: role with permission to CLoudWatch Logs, CodeBuild, S3, ADD ECR
    });

    testStage.addAction(testAction);

    //// Deploy Pipeline for healthomics workflows (2)
    // TODO: cross-account config:

//    const deployPipeline = new codepipeline.Pipeline(this, 'workflows_deploy_pipeline', {
//      crossAccountKeys: false, // so no AWS KMS CMK is created
//      pipelineName: 'Deploy',
//    });

    // Deploy pipeline approval stage  

  }
}