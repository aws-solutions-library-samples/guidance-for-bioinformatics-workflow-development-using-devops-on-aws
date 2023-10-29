import { CfnParameter,Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';


// extend the props of the stack by adding the vpc type from the SharedInfraStack
export interface OmicsDeployPipelinesStackProps extends StackProps {
  workflowsCodeRepo: codecommit.Repository;
}

export class OmicsDeployPipelinesStack extends Stack {
  readonly environment: string;
  private workflowsCodeRepo: codecommit.Repository;
  constructor(scope: Construct, id: string, props?: OmicsDeployPipelinesStackProps) {
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

    //// CodeBuild projects

  }
}