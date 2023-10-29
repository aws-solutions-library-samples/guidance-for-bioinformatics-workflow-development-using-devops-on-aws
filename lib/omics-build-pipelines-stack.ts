import { CfnParameter, Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as path from 'path';


// extend the props of the stack by adding some params
export interface OmicsBuildPipelinesStackProps extends StackProps {
  workflowName: string;
}

export class OmicsBuildPipelinesStack extends Stack {
  public readonly workflowsCodeRepo: codecommit.Repository;
  private workflowName: string;

  constructor(scope: Construct, id: string, props: OmicsBuildPipelinesStackProps) {
    super(scope, id, props);

    //// Parameters
    //const workflowName = new CfnParameter(this, 'workflowName', {
    //  description: 'Name of the workflow',
    //  type: 'String',
    //  allowedPattern: '^[a-zA-Z0-9-]*$',
    //  minLength: 4,
    //  maxLength: 20,
    //})

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

    const omicsTesterRole = new iam.Role(this, 'omicsTesterRole', {
      roleName: 'omicsTesterRole-'.concat(workflowName),
      assumedBy: new iam.ServicePrincipal('omics.amazonaws.com'),
      description: 'HealthOmics CI/CD Testing Role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonOmicsFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess"),
      ],
    });

    //// KMS Key (required to share artifacts accross accounts)
    // const artifactKey = new kms.Key(this,"PipelineKey")

    //// Git repositories

    this.workflowsCodeRepo = new codecommit.Repository(this, 'workflows_code_git', {
      repositoryName: 'healthomics-'.concat(workflowName, '-workflow'),
      //repositoryName: 'healthomics-workflow',
      code: codecommit.Code.fromDirectory(path.join(__dirname, '../project/'), 'main'),
      description: 'HealthOmics Workflows Git Repository for '.concat(workflowName, ' workflow.'),
    })

    //// S3 Buckets

    // Bucket for testing files, etc.
    const testFilesBucket = new s3.Bucket(this, 'testFilesBucket', {
      bucketName: 'test-files-'.concat(workflowName, '-', this.account),
      removalPolicy: RemovalPolicy.DESTROY, //change if you want to retain the bucket
      encryption: s3.BucketEncryption.S3_MANAGED, // change if you want to use KMS keys for encryption
      enforceSSL: true,
      versioned: false,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    testFilesBucket.grantReadWrite(omicsTesterRole);
    testFilesBucket.grantReadWrite(codeBuildRole);

    // Bucket for artifacts
    const artifactBucket = new s3.Bucket(this, 'artifactsBucket', {
      bucketName: 'artifacts-'.concat(workflowName, '-', this.account),
      removalPolicy: RemovalPolicy.RETAIN, //change if you want to destroy the bucket
      encryption: s3.BucketEncryption.S3_MANAGED, // change if you want to use KMS keys for encryption
      //encryptionKey: artifactKey, // change if you want to use other KMS keys for encryption     
      enforceSSL: true,
      versioned: false,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    testFilesBucket.grantRead(omicsTesterRole);
    testFilesBucket.grantReadWrite(codeBuildRole);

    //// CodeBuild projects

    const buildProject = new codebuild.PipelineProject(this, 'build_project', {
      projectName: 'build_project-'.concat(workflowName),
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-build.yaml'),
      role: codeBuildRole,
      environmentVariables: {
        WFNAME: { value: workflowName },
        ACCOUNT_ID: { value: this.account },
        TESTS_BUCKET_NAME: { value: testFilesBucket.bucketName },
        OMICS_TESTER_ROLE_ARN: { value: omicsTesterRole.roleArn }
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: true, // needed to connect to the Docker daemon for building the image
      },
    });

    const testProject = new codebuild.PipelineProject(this, 'test_project', {
      projectName: 'test_project-'.concat(workflowName),
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-test.yaml'),
      role: codeBuildRole,
      environmentVariables: {
        WFNAME: { value: workflowName },
        ACCOUNT_ID: { value: this.account },
        TESTS_BUCKET_NAME: { value: testFilesBucket.bucketName },
        OMICS_TESTER_ROLE_ARN: { value: omicsTesterRole.roleArn }
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: false,
      },
    });

    const releaseProject = new codebuild.PipelineProject(this, 'release_project', {
      projectName: 'release_project-'.concat(workflowName),
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-release.yaml'),
      role: codeBuildRole,
      environmentVariables: {
        WFNAME: { value: workflowName },
        ACCOUNT_ID: { value: this.account },
        TESTS_BUCKET_NAME: { value: testFilesBucket.bucketName },
        OMICS_TESTER_ROLE_ARN: { value: omicsTesterRole.roleArn }
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: false,
      },
    });

    //// Build Pipeline
    // Consider moving to pipeline Type V2 when supported by CNF/CDK

    const buildPipeline = new codepipeline.Pipeline(this, 'workflows_build_pipeline', {
      artifactBucket: artifactBucket,
      crossAccountKeys: true, // required to share artifacts accross accounts
      pipelineName: 'Build-'.concat(workflowName),
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
      repository: this.workflowsCodeRepo,
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
      actionName: 'workflow_build_action',
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
      actionName: 'workflow_test_action',
      project: testProject,
      input: sourceOutput,
      extraInputs: [buildOutput],
      outputs: [new codepipeline.Artifact()], // optional
      executeBatchBuild: false, // optional, defaults to false
      combineBatchBuildArtifacts: false, // optional, defaults to false
      //role: role with permission to CLoudWatch Logs, CodeBuild, S3, ADD ECR
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

    const releaseStage = buildPipeline.addStage({
      stageName: 'Release',
    });

    const tagAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'workflow_tag_action',
      project: releaseProject,
      input: sourceOutput,
      extraInputs: [buildOutput],
      outputs: [new codepipeline.Artifact()],
      executeBatchBuild: false, // optional, defaults to false
      combineBatchBuildArtifacts: false, // optional, defaults to false
      //role: role with permission to CLoudWatch Logs, CodeBuild, S3, ADD ECR
    });

    releaseStage.addAction(tagAction);

  }
}