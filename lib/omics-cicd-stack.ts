import { CfnParameter, Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
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
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DeployEnvironment } from "../types";
import * as path from 'path';
import * as fs from "fs";
import { OmicsWorkflowRole } from './omics-base';


// extend the props of the stack by adding some params
export interface OmicsCicdStackProps extends StackProps {
  workflowName: string,
  projectBranch: string,
  cicdEnv: DeployEnvironment,
  buildRoleName: string,
  deployEnv: DeployEnvironment,
  deployBucket: s3.Bucket
}

export class OmicsCicdStack extends Stack {
  public readonly crossAccountRole: iam.Role;
  public readonly deployRole: iam.Role;
  public readonly pipelineKey: kms.Key;
  public readonly workflowsCodeRepo: codecommit.Repository;
  constructor(scope: Construct, id: string, props: OmicsCicdStackProps) {
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
      roleName: `codePipelineRole-${props.workflowName}`,
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
      bucketName: `test-files-${props.workflowName}-${this.account}`,
      removalPolicy: RemovalPolicy.DESTROY, //change if you want to retain the bucket
      encryption: s3.BucketEncryption.S3_MANAGED, // change if you want to use KMS keys for encryption
      enforceSSL: true,
      versioned: false,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    testFilesBucket.grantReadWrite(codeBuildRole);
    testFilesBucket.grantReadWrite(codePipelineRole);

    //// Git repositories

    this.workflowsCodeRepo = new codecommit.Repository(this, 'workflows_code_git', {
      repositoryName: `healthomics-${props.workflowName}-workflow`,
      //repositoryName: 'healthomics-workflow',
      code: codecommit.Code.fromDirectory(path.join(__dirname, '../project/'), props.projectBranch),
      description: `HealthOmics Workflows Git Repository for ${props.workflowName} workflow.`,
    })

    //// CodeBuild Projects
    // Build Project
    const buildProject = new codebuild.PipelineProject(this, 'build_project', {
      projectName: `build_project-${props.workflowName}`,
      role: codeBuildRole,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-build.yaml'),
      environmentVariables: {
        WFNAME: { value: props.workflowName },
        ACCOUNT_ID: { value: this.account },
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
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-deploy-artifact.yaml'),
      environmentVariables: {
        WFNAME: { value: props.workflowName },
        BRANCH: { value: props.projectBranch },
        ACCOUNT_ID: { value: props.deployEnv.env.account },
        DEPLOYBUCKET: { value: props.deployBucket.bucketName },
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: false,
      },
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

    const testProject = new codebuild.PipelineProject(this, 'test_project', {
      projectName: 'test_project-'.concat(props.workflowName),
      role: codeBuildRole,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('cicd/buildspec-test.yaml'),
      environmentVariables: {
        WFNAME: { value: props.workflowName },
        ACCOUNT_ID: { value: this.account },
        TESTS_BUCKET_NAME: { value: testFilesBucket.bucketName },
        OMICS_TESTER_ROLE_ARN: { value: omicsTesterRole.roleArn }
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        privileged: false,
      },
    });

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

    // Function to run Health Omics workflow and wait for success/failure
    const stateMachineDefinitionJsonFile = fs.readFileSync(path.resolve(__dirname, '../step_function/healthomics_workflow_state_machine.json'))
    const omicsWorkflowStateMachine = new sfn.CfnStateMachine(this, 'health-omics-workflow-state-machine', {
      roleArn: runHealthOmicsStateMachineRole.roleArn,
      stateMachineName: "health-omics-workflow-state-machine",
      definitionString: stateMachineDefinitionJsonFile.toString(),
      definitionSubstitutions: {
        "HealthOmicsWorkflowLambdaName": "runHealthOmicsWorkflow",
        "HealthOmicsWorkflowJobRole": omicsTesterRole.roleArn,
        "HealthOmicsWorkflowOutputS3": `s3://${testFilesBucket.bucketName}/outputs`,
        "HealthOmicsWorkflowParamsS3": `s3://${testFilesBucket.bucketName}/test_params_cicd_nextflow_rnaseq.json`
      }
    });
    const stateMachineObject = sfn.StateMachine.fromStateMachineName(this, 'statemachineid', "health-omics-workflow-state-machine");
    //// Pipelines

    // Pipeline artifacts
    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    // Build Pipeline
    // Consider moving to pipeline Type V2 when supported by CNF/CDK

    const buildPipeline = new codepipeline.Pipeline(this, 'workflows_build_pipeline', {
      //artifactBucket: artifactBucket,
      crossAccountKeys: true, // required to share artifacts accross accounts
      pipelineName: `Pipeline-${props.workflowName}`,
      role: codePipelineRole
    });
    // Pipeline Stages
    // Pipeline source stage

    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      repository: this.workflowsCodeRepo,
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
      actionName: 'workflow_deploy_action',
      project: deployProject,
      input: sourceOutput,
      extraInputs: [buildOutput],
      executeBatchBuild: false,
      combineBatchBuildArtifacts: false,
    });

    deployStage.addAction(deployAction);
  }
};