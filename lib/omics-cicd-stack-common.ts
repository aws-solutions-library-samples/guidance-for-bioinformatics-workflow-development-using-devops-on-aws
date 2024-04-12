// Copyright Amazon.com, Inc. or its affiliates.

import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DeployEnvironment } from "../types";
import { OmicsWorkflowRole } from './omics-base';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { uriToS3Arn, uriToS3BucketArn } from './omics-base';
import { NagSuppressions } from "cdk-nag";

// extend the props of the stack by adding some params
export interface OmicsCicdCommonStackProps extends StackProps {
  cicdEnv: DeployEnvironment,
  buildRoleName: string,
  deployEnv: DeployEnvironment,
  deployBucket: s3.Bucket,
  sourceDataS3URIs?: string[],
}

export class OmicsCommonCicdStack extends Stack {
  public readonly crossAccountRole: iam.Role;
  public readonly deployRole: iam.Role;
  public readonly codePipelineRole: iam.Role;
  public readonly testFilesBucket: s3.Bucket;
  constructor(scope: Construct, id: string, props: OmicsCicdCommonStackProps) {
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

    //   IAM Custom Policies
    const cdkDeployPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'sts:AssumeRole',
          'iam:PassRole',
        ],
        resources: [
          `arn:aws:iam::${props.cicdEnv.env.account}:role/cdk-hnb659fds-deploy-role-${props.cicdEnv.env.account}-${this.region}`,
          `arn:aws:iam::${props.cicdEnv.env.account}:role/cdk-hnb659fds-file-publishing-${props.cicdEnv.env.account}-${this.region}`
        ]
      })],
    });

    const stepFunctCallPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'states:StartExecution'
        ],
        resources: [
          `arn:aws:states:${props.cicdEnv.env.region}:${props.cicdEnv.env.account}:stateMachine:omx-container-puller`,
        ]
      }),
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'states:DescribeExecution'
        ],
        resources: [
          `arn:aws:states:${props.cicdEnv.env.region}:${props.cicdEnv.env.account}:execution:omx-container-puller:*`
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
          `arn:aws:cloudformation:${props.cicdEnv.env.region}:${props.cicdEnv.env.account}:stack/*/*`
        ]
      })],
    });

    const deployBucketPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject"
        ],
        resources: [
          props.deployBucket.bucketArn,
          `${props.deployBucket.bucketArn}/*`
        ]
      })],
    });

    //   IAM Roles
    const codeBuildRole = new iam.Role(this, 'codeBuildRole', {
      roleName: props.buildRoleName,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('codebuild.amazonaws.com'),
      ),
      description: 'CodeBuild standard Role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeCommitPowerUser"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonOmicsFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryFullAccess"),
      ],
      inlinePolicies: {
        CdkDeployPolicy: cdkDeployPolicy,
        StepFunctionCallPolicy: stepFunctCallPolicy,
        CfnStacksPolicy: cfnStacksPolicy,
        DeployBucketPolicy: deployBucketPolicy
      },
    });
    
    if (props.sourceDataS3URIs) {
      const s3AccessPolicy = new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: [ "s3:GetObject" ],
            resources: props.sourceDataS3URIs.map(uriToS3Arn)
          }),
          new iam.PolicyStatement({
            actions: [ "s3:ListBucket" ],
            resources: props.sourceDataS3URIs.map(uriToS3BucketArn)
          }),
        ]
      });

      codeBuildRole.attachInlinePolicy(
        new iam.Policy(this, 'S3AccessPolicy', {
          document: s3AccessPolicy,
        })
      )
    }
    NagSuppressions.addResourceSuppressions(codeBuildRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Need ability to describe all executions in Step Functions'
      },
    ])


    const codePipelineRole = new iam.Role(this, 'codePipelineRole', {
      roleName: `omicsCodePipelineRole`,
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
      description: 'CodePipeline standard Role',
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

    //// S3 Buckets
    // Bucket for testing files, etc. in CICD account
    const testFilesBucket = new s3.Bucket(this, 'testFilesBucket', {
      bucketName: `healthomics-cicd-test-data-${this.account}-${this.region}`,
      removalPolicy: RemovalPolicy.DESTROY, //change if you want to retain the bucket
      encryption: s3.BucketEncryption.S3_MANAGED, // change if you want to use KMS keys for encryption
      enforceSSL: true,
      versioned: false,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    testFilesBucket.grantReadWrite(codeBuildRole);
    testFilesBucket.grantReadWrite(codePipelineRole);

    // Bucket for CICD scripts in CICD account
    const cicdScriptsBucket = new s3.Bucket(this, 'cicdScriptsBucket', {
      bucketName: `healthomics-cicd-scripts-${this.account}-${this.region}`,
      removalPolicy: RemovalPolicy.DESTROY, //change if you want to retain the bucket
      encryption: s3.BucketEncryption.S3_MANAGED, // change if you want to use KMS keys for encryption
      enforceSSL: true,
      versioned: false,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    cicdScriptsBucket.grantReadWrite(codeBuildRole);
    cicdScriptsBucket.grantReadWrite(codePipelineRole);

    // Deploy CICD scripts to this bucket in CICD account
    const s3Deploy = new s3deploy.BucketDeployment(this, 'UploadCiCdScripts', {
      sources: [s3deploy.Source.asset('cicd/scripts/')],
      destinationBucket: cicdScriptsBucket,
      destinationKeyPrefix: 'cicd_scripts/',
      retainOnDelete: false
    });

    // Dynamic Tests Project
    const omicsTesterRole = new OmicsWorkflowRole(this, 'omicsTesterRole', {
      sourceS3Uris: ["s3://*/*"],
      outputS3Arn: "arn:aws:s3:::" +  testFilesBucket.bucketName + "/*"
    });

    codeBuildRole.attachInlinePolicy(new iam.Policy(this, 'pass-role-access', {
      statements: [
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [omicsTesterRole.roleArn]
        })
      ]
    }))


    const healthOmicsWorkflowServiceRole = new iam.Role(this, 'healthOmicsWorkflowServiceRole', {
      roleName: "healthOmicsWorkflowServiceRole",
      assumedBy: new iam.ServicePrincipal('omics.amazonaws.com'),
      description: 'b',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonOmicsFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryPowerUser"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess")
      ],
      inlinePolicies: {
      },
    });

    // 👇 Create IAM Get/Pass Role for HealthOmics
    const passWorkflowJobROle = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [healthOmicsWorkflowServiceRole.roleArn],
          actions: ['iam:GetRole', 'iam:PassRole']
        }),
      ],
    });

    const runHealthOmicsWorkflowLambdaRole = new iam.Role(this, 'runHealthOmicsWorkflowLambdaRole', {
      roleName: "RunHealthOmicsWorkflowLambdaRole",
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: '',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonOmicsFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
      ],
      inlinePolicies: {       
        AllowPassRole: passWorkflowJobROle
      },
    });

    
    // Function to run HealthOmics workflow 
    const runHealthOmicsWorkflow = new lambda.Function(
      this, "runHealthOmicsWorkflow",
      {
        functionName: "runHealthOmicsWorkflow",
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "lambda_function.handler",
        timeout: Duration.seconds(300),
        code: lambda.Code.fromAsset("lambda/startHealthOmicsWorkflow/"),
        role: runHealthOmicsWorkflowLambdaRole,
        environment: {
        },
      }
    );
    
    const omicsGetRunPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "omics:GetRun",
        ],
        resources: [`arn:aws:omics:${this.region}:${this.account}:run/*`]
      })],
    });

    const runHealthOmicsStateMachineRole = new iam.Role(this, 'runHealthOmicsStateMachineRole', {
      roleName: "RunHealthOmicsWorkflowStateMachineRole",
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      description: 'Role assumed by the State Machine that will run the test AWS HealthOmics workflow',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSLambda_FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXrayFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess")
      ],
      inlinePolicies: {
        OmicsGetRunPolicy: omicsGetRunPolicy   
      },
    });

    // export required roles
    new CfnOutput(this, 'OmicsCicdCodeBuildRole', { value: codeBuildRole.roleArn, exportName: 'OmicsCicdCodeBuildRole' }, );
    new CfnOutput(this, 'OmicsCicdCodePipelineRole', { value: codePipelineRole.roleArn, exportName: 'OmicsCicdCodePipelineRole' }, );
    new CfnOutput(this, 'OmicsTesterRole', { value: omicsTesterRole.roleArn, exportName: 'OmicsTesterRole' });
    new CfnOutput(this, 'HealthOmicsStateMachineRole', { value: runHealthOmicsStateMachineRole.roleArn, exportName: 'HealthOmicsStateMachineRole' });
    new CfnOutput(this, 'OmicsCicdTestDataBucket', { value: testFilesBucket.bucketName, exportName: 'OmicsCicdTestDataBucket' });
    new CfnOutput(this, 'OmicsCicdScriptsBucket', { value: cicdScriptsBucket.bucketName, exportName: 'OmicsCicdScriptsBucket' });

  }
};