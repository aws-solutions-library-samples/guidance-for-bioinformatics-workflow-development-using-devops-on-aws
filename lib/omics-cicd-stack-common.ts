import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DeployEnvironment } from "../types";
import { OmicsWorkflowRole } from './omics-base';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

// extend the props of the stack by adding some params
export interface OmicsCicdCommonStackProps extends StackProps {
  cicdEnv: DeployEnvironment,
  buildRoleName: string,
  deployEnv: DeployEnvironment,
  deployBucket: s3.Bucket
}

export class OmicsCommonCicdStack extends Stack {
  public readonly crossAccountRole: iam.Role;
  public readonly deployRole: iam.Role;
  public readonly pipelineKey: kms.Key;
  public readonly codePipelineRole: iam.Role;
  public readonly testFilesBucket: s3.Bucket;
  //public readonly workflowsCodeRepo: codecommit.Repository;
  constructor(scope: Construct, id: string, props: OmicsCicdCommonStackProps) {
    super(scope, id, props);


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
          `arn:aws:iam::${props.cicdEnv.env.account}:role/cdk-readOnlyRole`,
          `arn:aws:iam::${props.cicdEnv.env.account}:role/cdk-hnb659fds-deploy-role-*`,
          `arn:aws:iam::${props.cicdEnv.env.account}:role/cdk-hnb659fds-file-publishing-*`,
          `arn:aws:iam::${props.cicdEnv.env.account}:role/OmicsCicdMinimalStack*`
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

    const deployKeyPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:ReEncrypt*"
        ],
        resources: [
          `arn:aws:kms:*:${props.deployEnv.env.account}:key/*`
        ]
      })],
    });

    const deployBucketPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:*",
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
      ],
      inlinePolicies: {
        CdkDeployPolicy: cdkDeployPolicy,
        StepFunctionCallPolicy: stepFunctCallPolicy,
        CfnStacksPolicy: cfnStacksPolicy,
        DeployKeyPolicy: deployKeyPolicy,
        DeployBucketPolicy: deployBucketPolicy
      },
    });


    const codePipelineRole = new iam.Role(this, 'codePipelineRole', {
      roleName: `omicsCodePipelineRole`,
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
      //assumedBy: new iam.ArnPrincipal('arn:aws:iam::889574981585:role/OmicsCicdMinimalStack-workflowsbuildpipelineRole51E-HomhQE8yWszD'),
      //assumedBy: new iam.ArnPrincipal(`arn:aws:iam::${props.cicdEnv.env.account}:role/OmicsCicdMinimalStack*`),
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
    // Bucket for testing files, etc.
    const testFilesBucket = new s3.Bucket(this, 'testFilesBucket', {
      bucketName: `test-files-omics-cicd-${this.account}-${this.region}`,
      removalPolicy: RemovalPolicy.DESTROY, //change if you want to retain the bucket
      encryption: s3.BucketEncryption.S3_MANAGED, // change if you want to use KMS keys for encryption
      enforceSSL: true,
      versioned: false,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    testFilesBucket.grantReadWrite(codeBuildRole);
    testFilesBucket.grantReadWrite(codePipelineRole);

    // Deploy CICD scripts to this bucket
    const s3Deploy = new s3deploy.BucketDeployment(this, 'UploadCiCdScripts', {
      sources: [s3deploy.Source.asset('cicd/scripts/')],
      destinationBucket: testFilesBucket,
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
      description: 'b',
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
        runtime: lambda.Runtime.PYTHON_3_10,
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
        resources: ['*']
      })],
    });

    const runHealthOmicsStateMachineRole = new iam.Role(this, 'runHealthOmicsStateMachineRole', {
      roleName: "RunHealthOmicsWorkflowStateMachineRole",
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      description: 'b',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSLambda_FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXrayFullAccess")
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

  }
};