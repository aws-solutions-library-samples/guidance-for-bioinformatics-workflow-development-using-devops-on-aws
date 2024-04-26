// Copyright Amazon.com, Inc. or its affiliates.

import { Duration, Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { DeployEnvironment } from "../types";
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { NagSuppressions } from "cdk-nag";

// extend the props of the stack by adding some params
export interface OmicsDeployResourcesProps extends StackProps {
  cicdEnv: DeployEnvironment,
  buildRoleName: string
}

export class OmicsDeployCommonResourcesStack extends Stack {
  public readonly crossAccountRole: iam.Role;
  public readonly deployRole: iam.Role;
  public readonly deployBucket: s3.Bucket;
  public readonly runReleaseBuildLambdaRole: iam.Role;
  

  constructor(scope: Construct, id: string, props: OmicsDeployResourcesProps) {
    super(scope, id, props);

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Solution requires permissions available in a managed policy'
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Solution requires permissions available in a managed policy'
      },
      {
        id: 'AwsSolutions-S1',
        reason: 'Server Access logging not applicable to CI/CD buckets'
      },
      {
        id: 'AwsSolutions-CB4',
        reason: 'Solution can be updated to apply end users encryption strategy'
      },
      {
        id: 'AwsSolutions-KMS5',
        reason: 'Key rotation not needed in S3_MANAGED'
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'Unable to update runtime for custom resources'
      }
    ])
    //// IAM Resources
    // IAM Policies
    // IAM Custom Policies
    const cdkDeployPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'sts:AssumeRole',
          'iam:PassRole',
        ],
        resources: [
          `arn:aws:iam::*:role/cdk-*`
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

    // IAM Roles
    const crossAccountRole = new iam.Role(this, 'crossAccountRole', {
      roleName: 'CrossAccountRole-CodeBuild',
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'CodeBuild standard Role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeCommitPowerUser"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonOmicsFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess"),
      ],
      inlinePolicies: {
      },
    });

    const deployRole = new iam.Role(this, 'deployRole', {
      roleName: 'DeployRole-CodeBuild',
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'CodeBuild standard Role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeCommitPowerUser"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonOmicsFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess"),
      ],
      inlinePolicies: {       
        StepFunctionCallPolicy: stepFunctCallPolicy,
        CdkDeployPolicy: cdkDeployPolicy
      },
    });

    const runReleaseBuildLambdaRole = new iam.Role(this, 'runReleaseBuildLambdaRole', {
      roleName: 'RunReleaseBuildRole-Lambda',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: '',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonOmicsFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeBuildDeveloperAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
      ],
      inlinePolicies: {       
      },
    });


    //// Common Bucket for artifacts
    this.deployBucket = new s3.Bucket(this, 'deployBucket', {
      bucketName: `artifact-healthomics-${this.account}-${this.region}`,
      removalPolicy: RemovalPolicy.DESTROY, //change if you want to destroy the bucket
      encryption: s3.BucketEncryption.S3_MANAGED, // Move to KMS once enalbed cross-stack key sharing
      enforceSSL: true,
      versioned: false,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsPrefix: "access-logs"
    });

    this.deployBucket.grantRead(new iam.AccountPrincipal(props.cicdEnv.env.account));
    this.deployBucket.grantPut(new iam.AccountPrincipal(props.cicdEnv.env.account));
    this.deployBucket.grantRead(deployRole);
    this.deployBucket.grantRead(runReleaseBuildLambdaRole);
    

    // Deploy CICD scripts to the deployment bucket 
    const s3ExtDeploy = new s3deploy.BucketDeployment(this, 'UploadCiCdScriptsExt', {
      sources: [s3deploy.Source.asset('cicd/scripts/')],
      destinationBucket: this.deployBucket,
      destinationKeyPrefix: 'cicd_scripts/',
      retainOnDelete: true
    });
    s3ExtDeploy.node.addDependency(this.deployBucket);

    //// CodeBuild Projects
    // Build Project
    const releaseProject = new codebuild.Project(this, 'releaseProject', {
      projectName: 'release_project',
      role: deployRole,
      buildSpec: codebuild.BuildSpec.fromAsset('cicd/buildspec-release.yaml'),
      environmentVariables: {
        ACCOUNT_ID: { value: this.account },
        DEPLOYBUCKET: { value: this.deployBucket.bucketName }
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: false,
      },
    });
    releaseProject.node.addDependency(this.deployBucket);

    //// Lambda Functions 
    // Function to run Release Codebuild Project
    const runReleaseBuildProject = new lambda.Function(
      this, "runReleaseBuildProject",
      {
        functionName: 'runReleaseBuildProject',
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "lambda_function.lambda_handler",
        timeout: Duration.seconds(300),
        code: lambda.Code.fromAsset("lambda/runReleaseBuildProject/"),
        role: runReleaseBuildLambdaRole,
        environment: {
          CICD_ACCOUNT_ID: props.cicdEnv.env.account
        },
        tracing: lambda.Tracing.ACTIVE
      }
    );

    // S3 Event and Trigger for Run Release CodeBuild Project Function
    const s3DeployPutEventSource = new lambdaEventSources.S3EventSource(this.deployBucket, {
      events: [
        s3.EventType.OBJECT_CREATED_PUT
      ],
      filters: [
        {prefix: 'artifacts/'},
        {suffix: '.zip'}
      ]
    });
    runReleaseBuildProject.addEventSource(s3DeployPutEventSource);
  }
};