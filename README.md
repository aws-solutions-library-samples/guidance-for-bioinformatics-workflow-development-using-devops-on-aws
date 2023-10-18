# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Commands used to bootstrap

Bootstrapping is the process of provisioning resources for the AWS CDK before you can deploy AWS CDK apps into an AWS environment. (An AWS environment is a combination of an AWS account and Region).
These resources include an Amazon S3 bucket for storing files and IAM roles that grant permissions needed to perform deployments.

```bash
npm install -g aws-cdk
npm install -g aws-cdk-lib
npm i @types/node -D
cdk bootstrap aws://ACCOUNT-NUMBER-1/REGION-1 aws://ACCOUNT-NUMBER-2/REGION-2 ...
# alternatively, you can use aws profiles:
cdk bootstrap --profile prod
```

## Versioning  

Artifacts in this project are generated in the form of aws healthomics worflows.  
In order to identify different versions, we propose to use semantic versioning.  
This can be done using resource tags, but also including this information in the workflow name to make it easier to identify them.  
The source for all this comes from the code repositories, where we use information from branch name and git tags to generate resource tags and resource names.  
Tags are defined on a specific branch.  We propose using the following tag pattern:  
```branchName-majorVersion.minorVersion.PatchVersion```
For example: lgg_iac-3.1.27  

Artifact (Workflow) names are generated following the pattern:  

```workflowName-branchName-majorVersion.minorVersion.PatchVersion```  
For example:
RNAseqQC-lgg_iac-3.1.27  

The same applies to artifact tags. this is the list we are using:
* WORKFLOW
* BRANCH
* MAJOR_VERSION
* MINOR_VERSION
* PATCH_VERSION
* COMMIT_ID
* BUILD_SOURCE
* STARTED_BY

The workflow, major and minor version are taken from buildspec-build.yaml file in the project.  
Branch, commit_id and build_source are taken from environment variables  
Patch version is automatically generated based on previous tags in the branch.  