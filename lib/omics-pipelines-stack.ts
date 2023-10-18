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

    // IAM Roles

    const codeBuildRole = new iam.Role(this, 'codeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'CodeBuild standard Role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonOmicsFullAccess"),
      ],
    });


    // CodeBuild projects

    const buildProject = new codebuild.PipelineProject(this, 'build_project', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-build.yaml'),
      role: codeBuildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:3.0'),
        privileged: true, // needed to connect to the Docker daemon for building the image
      },
    });

    const testProject = new codebuild.PipelineProject(this, 'test_project', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-test.yaml'),
      role: codeBuildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:3.0'),
        privileged: true, // needed to connect to the Docker daemon for building the image
      },
    });

    const uploadProject = new codebuild.PipelineProject(this, 'upload_project', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-upload.yaml'),
      role: codeBuildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:3.0'),
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


    //// Build Pipeline (2)

    const buildPipeline = new codepipeline.Pipeline(this, 'workflows_build_pipeline', {
      crossAccountKeys: false, // so no AWS KMS CMK is created
      pipelineName: 'Build',
    });

    const sourceOutput = new codepipeline.Artifact();
    
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
      trigger: codepipeline_actions.CodeCommitTrigger.POLL, // disable CloudWatch events
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
      outputs: [new codepipeline.Artifact()], // optional
      executeBatchBuild: false, // optional, defaults to false
      combineBatchBuildArtifacts: false, // optional, defaults to false
      //role: role with permission to CLoudWatch Logs, CodeBuild, S3, ADD ECR
      //arn:aws:iam::095077925459:role/AwsCicdStack-buildprojectRole8A6CB32D-RWLQGLB1AKC7
    });

    buildStage.addAction(buildAction);

    // Build pipeline test stage

    const testStage = buildPipeline.addStage({
      stageName: 'Test',
    });

    const testAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'workflows_test_action',
      project: testProject,
      input: sourceOutput,
      outputs: [new codepipeline.Artifact()], // optional
      executeBatchBuild: false, // optional, defaults to false
      combineBatchBuildArtifacts: false, // optional, defaults to false
      //role: role with permission to CLoudWatch Logs, CodeBuild, S3, ADD ECR
    });

    testStage.addAction(testAction);

  }

}

//// Deploy Pipeline for healthomics workflows (3)


// Deploy pipeline approval stage