import { CfnParameter,Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

export interface Config extends StackProps {
  readonly params: {
    readonly environment: string;
  };
}

export class OmicsPipelinesStack extends Stack {
  
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Parameters
    const workflowName = new CfnParameter(this, 'workflowName', {
      description: 'Name of the workflow',
      type: 'String',
      allowedPattern: '^[a-zA-Z0-9-]*$',
      minLength: 4,
      maxLength: 20,
    })
    console.log('workflowName ---> ', workflowName.valueAsString);

    // Git repositories

    const workflowsCodeRepo = new codecommit.Repository(this, 'workflows_code_git', {
      repositoryName: 'healthomics-'.concat(workflowName.valueAsString,'-workflow'),
      code: codecommit.Code.fromDirectory(path.join(__dirname, '../project/'), 'main'),
    })

    //// ECR Repository

    //const ecrRepo = new ecr.Repository(this, 'healthomics_ecr', {
    //  repositoryName: 'healthomics-repo',
    //  removalPolicy: RemovalPolicy.DESTROY, //change if you want to retain the repo
    //});
    
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
      roleName: 'codeBuildRole-'.concat(workflowName.valueAsString),
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
      roleName: 'omicsTesterRole-'.concat(workflowName.valueAsString),
      assumedBy: new iam.ServicePrincipal('omics.amazonaws.com'),
      description: 'HealthOmics CI/CD Testing Role',
      managedPolicies: [       
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonOmicsFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess"),
      ]
    });    

    //// S3 Bucket for testing files, etc.
    const testFilesBucket = new s3.Bucket(this, 'testFilesBucket', {
      bucketName: 'test-files-'.concat(workflowName.valueAsString,'-',this.account),
      removalPolicy: RemovalPolicy.DESTROY, //change if you want to retain the bucket
      encryption: s3.BucketEncryption.S3_MANAGED, // change if you want to use KMS keys for encryption
      enforceSSL: true,
      versioned: false,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    testFilesBucket.grantReadWrite(omicsTesterRole);

    //// CodeBuild projects

    const buildProject = new codebuild.PipelineProject(this, 'build_project', {
      projectName: 'build_project-'.concat(workflowName.valueAsString),
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-build.yaml'),
      role: codeBuildRole,
      environmentVariables: {
        WFNAME: {value: workflowName.valueAsString},
        ACCOUNT_ID: {value: this.account},
        TESTS_BUCKET_NAME: {value: testFilesBucket.bucketName},
        OMICS_TESTER_ROLE_ARN: {value: omicsTesterRole.roleArn}
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: true, // needed to connect to the Docker daemon for building the image
      },
    });

    const testProject = new codebuild.PipelineProject(this, 'test_project', {
      projectName: 'test_project-'.concat(workflowName.valueAsString),
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-test.yaml'),
      role: codeBuildRole,
      environmentVariables: {
        WFNAME: {value: workflowName.valueAsString},
        ACCOUNT_ID: {value: this.account},
        TESTS_BUCKET_NAME: {value: testFilesBucket.bucketName},
        OMICS_TESTER_ROLE_ARN: {value: omicsTesterRole.roleArn}
      },      
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: true, // needed to connect to the Docker daemon for building the image
      },
    });

    const uploadProject = new codebuild.PipelineProject(this, 'upload_project', {
      projectName: 'upload_project-'.concat(workflowName.valueAsString),
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-upload.yaml'),
      role: codeBuildRole,
      environmentVariables: {
        WFNAME: {value: workflowName.valueAsString},
        ACCOUNT_ID: {value: this.account},
        TESTS_BUCKET_NAME: {value: testFilesBucket.bucketName},
        OMICS_TESTER_ROLE_ARN: {value: omicsTesterRole.roleArn}
      },      
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: true, // needed to connect to the Docker daemon for building the image
      },
    });

    //// Build Pipeline (1)
    // Consider moving to pipeline Type V2 when supported by CNF/CDK

    const buildPipeline = new codepipeline.Pipeline(this, 'workflows_build_pipeline', {
      crossAccountKeys: false, // so no AWS KMS CMK is created
      pipelineName: 'Build-'.concat(workflowName.valueAsString),
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

    //// Deploy Pipeline for healthomics workflows (2)
    // Consider moving to pipeline Type V2 when supported by CNF/CDK    
    // TODO: cross-account config:

//    const deployPipeline = new codepipeline.Pipeline(this, 'workflows_deploy_pipeline', {
//      crossAccountKeys: false, // so no AWS KMS CMK is created
//      pipelineName: 'Deploy',
//    });

    // Deploy pipeline approval stage  

  }
}