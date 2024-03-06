# Guidance for Bioinformatics workflow CI/CD on AWS

## Table of Contents

- [Guidance for Bioinformatics workflow CI/CD on AWS](#guidance-for-bioinformatics-workflow-cicd-on-aws)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
    - [Cost](#cost)
  - [Prerequisites](#prerequisites)
    - [Operating System](#operating-system)
    - [Additional tools](#additional-tools)
    - [AWS account requirements](#aws-account-requirements)
    - [Supported Regions](#supported-regions)
  - [Deployment Steps](#deployment-steps)
  - [Deployment Validation](#deployment-validation)
  - [Running the Guidance](#running-the-guidance)
  - [Next Steps](#next-steps)
  - [Cleanup](#cleanup)
  - [FAQ, known issues, additional considerations, and limitations (optional)](#faq-known-issues-additional-considerations-and-limitations-optional)
    - [Additional considerations](#additional-considerations)
    - [Semantic versioning](#semantic-versioning)
    - [Branching strategies](#branching-strategies)
      - [Trunk-based](#trunk-based)
      - [Gitflow](#gitflow)
  - [Revisions](#revisions)
  - [\[Unreleased\]](#unreleased)
    - [Added](#added)
  - [Notices](#notices)

## Overview

Secondary analysis pipelines in omics are software, and like any other software product they have versions that need to be tracked, tested, and released when ready for wider use. This also applies to [AWS HealthOmics](https://aws.amazon.com/healthomics/) workflows.  Building, testing, and deploying new workflow versions is undifferentiated heavy lift. This solution makes the cloud resources for automated testing and deployment of secondary analysis (and other bioinformatics) pipelines easy to acquire, provision, and use.

**Features provided by this solution include:**
* Release process and notification  
* Semantic Versioning  
* Cross Account deployments  
    * secure build  
    * environment isolation  
    * safe deployments  

![architecture](./assets/images/architecture.png)

The steps involved are generally the same across all organizations:

1. A new version of the workflow definition is committed to source code version control (e.g. Git).  
2. Any components of the definition that need to be built are processed - e.g. tooling containers, and staged to corresponding AWS services for testing: containers to ECR, workflow to AWS HealthOmics, etc. A static test is performed on the workflow definition to quickly detect any major issues.   
3. The workflow is dynamically tested to ensure it performs as expected and there are no regressions in existing capabilities. Test data is used for this, ideally using a small dataset so tests complete quickly.    
4. If all tests pass and the build is approved, a new release is made, and the workflow is deployed to production staging.
5. Production staging triggers deployment automation in the production account, this can be ...
6. ... build in the production account, similar to what was done in step 2, creating container and workflow assets as needed.
7. The workflow is now available for production use

The steps above are conceptually no different that those taken for other software products. The primary difference is the time scale involved. Workflow run times are dependent on the size of input data used, and test driven iteration times can be on the order of hours. Optimizing iteration times is out of scope for this solution. 


### Cost

_You are responsible for the cost of the AWS services used while running this Guidance. As of March 2024, the cost for running this Guidance with the default settings in the US East (N. Virginia) region is approximately $5.00 per month for processing 30 builds and production deployments of a workflow that uses up to 10 container images in one month._

The above is for the base cost of the services used for CI/CD, which include:
- AWS CodeCommit
- AWS CodeBuild
- AWS CodePipeline
- AWS StepFunctions
- Amazon Elastic Container Registry

Costs for dynamic testing of workflows on AWS HealthOmics will vary depending on the workflow tasks defined and test data used.

## Prerequisites

### Operating System

Assuming all prerequisites are installed, the guidance can be deployed using the command line from Linux, Mac, and Windows operating systems.

These deployment instructions are optimized to work best on **Amazon Linux 2023**. Deployment in another OS may require additional steps.

### Additional tools

During deployment this guidance will install the [Amazon ECR helper for AWS HealthOmics](https://github.com/aws-samples/amazon-ecr-helper-for-aws-healthomics) CDK application.

### AWS account requirements

This deployment requires at least 2 AWS accounts (e.g. "cicd" and "production") where you have:
- the [AdministratorAccess AWS managed policy](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AdministratorAccess.html) granted to your calling identity
  - required for your "cicd" account
  - can be scoped down for your "production" account
- both console and programamtic access 

### Supported Regions

This guidance is best suited for regions where AWS HealthOmics is [available](https://docs.aws.amazon.com/general/latest/gr/healthomics-quotas.html).

## Deployment Steps

Deployment steps must be numbered, comprehensive, and usable to customers at any level of AWS expertise. The steps must include the precise commands to run, and describe the action it performs.

* All steps must be numbered.
* If the step requires manual actions from the AWS console, include a screenshot if possible.
* The steps must start with the following command to clone the repo. ```git clone xxxxxxx```
* If applicable, provide instructions to create the Python virtual environment, and installing the packages using ```requirement.txt```.
* If applicable, provide instructions to capture the deployed resource ARN or ID using the CLI command (recommended), or console action.

 
1. Clone this repository.
    ```bash
    git clone https://github.com/aws-solutions-library-samples/guidance-for-bioinformatics-workflow-ci-cd-on-aws.git
    ```

2. Configure AWS CLI profiles for the accounts you wish to use.
   
   Select at least two AWS accounts to deploy the solution into. By default, this guidance works with one CI/CD and one deployment (e.g. production) account, but can be extended to work with additional accounts.

   This guidance uses the AWS CDK to deploy resources which uses AWS CLI profiles to access AWS environments. Profiles for `cicd` and `production` need to be configured.

    ```bash
    aws configure --profile cicd
    # ... follow CLI prompts to complete

    aws configure --profile prod
    # ... follow CLI prompts to complete
    ```

3. Bootstrap the AWS accounts you selected with the AWS CDK.
   
   > **NOTE:** Perform the bootstrapping commands __OUTSIDE__ of the project folder, like your home folder (`~`).

   Bootstrapping provisions resources used by the AWS CDK to deploy AWS CDK apps into an AWS environment. (An AWS environment is a combination of an AWS account and Region). These resources include an Amazon S3 bucket for storing files and IAM roles that grant permissions needed to perform deployments.  

    Because this solution leverages cross-account access, the bootstrap process is a little more complex than a single-account case, requiring creating trust relationships between accounts.

    Start by bootstrapping the `cicd` account. This is the account that will contain workflow and container source code, run tests, and deploy to other accounts.
    ```bash
    cdk bootstrap 
        --profile cicd 
        aws://<CICD_AWS_ACCOUNT_ID>/<AWS_REGION> 
        --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
    ```

    Next bootstrap the `prod` account. This account will have "released" workflows deployed into it. Thus, it need needs to have a trust relationship with the `cicd` account (that account that invokes the deployment).
    ```bash
    cdk bootstrap 
        --profile prod 
        --trust <CICD ACCOUNT_ID> 
        aws://<PROD_AWS_ACCOUNT_ID>/<AWS_REGION> 
        --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
    ```

4. Change to the repo folder and install `npm` packages
    ```bash
    cd guidance-for-bioinformatics-workflow-ci-cd-on-aws
    npm install
    ```

5. Configure the deployment
   
   1. Add the AWS accounts you will use.

        Edit the [cdk.json](cdk.json) file.

        Add the following properties to the `context` property in the json (replace with your own values):  

        ```json
            "cicd_account": "111122223333",
            "test_account": "111122223333",
            "prod_account": "777788889999",
            "aws_region": "<aws-region>",    
        ```

        There are 3 deployment stages (AWS accounts) configured. The `cicd` and `test` are configured to be the same account. You can make these different accounts if needed. Just remember to bootstrap any additional accounts you use.  
            
        > :warning: WARNING :warning:
        > Always remove the account numbers and emails from configuration files before sharing them publicly (e.g. pushing to a public repo).  
   
   2. Add workflow source repositories
        
        Edit the `context.workflows` property in the [cdk.json](cdk.json) file. This is a mapping of workflow names and their corresponding CodeCommit repository names.

        Examples:
        ```json
        "workflows": {
            "nf-workflow-a": "codecommit-repo-nf-workflow-a",
            "nf-workflow-b": "codecommit-repo-nf-workflow-b",
            ... 
        }
        ```

        The CodeCommit repositories can be ones that already exist in your `cicd` account or ones you plan to create later.

        During deployment, the following resources are created for each workflow listed in `context.workflows`:
        - An AWS CodeBuild project to build workflow artifacts like containers
        - An AWS CodeBuild project to deploy the workflow and artifacts to testing and production environments.
        - An AWS CodePipeline pipeline to coordinate testing and deployment of the workflow

        The CodePipeline pipeline references a AWS CodeCommit repository by name, and will be triggered to run with any commited changes to the `main` branch therein. If this repository does not exist, you need to create it.
    
    3. Add S3 URIs for any read-only datasets used during testing.

        Edit the `context.source_data_s3_uris` property in the [cdk.json](cdk.json) file. This is a list of S3 URIs that the CI/CD automation will be granted **read-only** access to.

        Examples:
        ```json
        "source_data_s3_uris": [
            "s3://entire-bucket/*",
            "s3://bucket/entire-folder/*",
            "s3://bucket-with-wildcard-name-*/*",
            "s3://bucket/specific/object"
            ... 
        ]
        ```

6. Deploy the guidance. The following command will deploy resources in your CI/CD, testing, and production accounts.
   ```bash
   cd guidance-for-bioinformatics-workflow-ci-cd-on-aws
   npx cdk deploy --profile cicd --all
   ```

    If you update any of the workflows or accounts used by the solution, you will need to redeploy by running the above command again.


## Deployment Validation

When successfully deployed, at least three stacks will be created and terminal output should look like:

```bash

✨  Synthesis time: 2.25s

OmicsCicdCommonStack
OmicsCicdCommonStack: deploying... [2/3]

 ✅  OmicsCicdCommonStack

✨  Deployment time: n.nns

Outputs:
OmicsCicdCommonStack.HealthOmicsStateMachineRole = arn:aws:iam::{{CICD_AWS_ACCOUNT_ID}}:role/RunHealthOmicsWorkflowStateMachineRole
OmicsCicdCommonStack.OmicsCicdCodeBuildRole = arn:aws:iam::{{CICD_AWS_ACCOUNT_ID}}:role/omicsCiCdCodeBuildRole
OmicsCicdCommonStack.OmicsCicdCodePipelineRole = arn:aws:iam::{{CICD_AWS_ACCOUNT_ID}}:role/omicsCodePipelineRole
OmicsCicdCommonStack.OmicsCicdTestDataBucket = test-files-omics-cicd-{{CICD_AWS_ACCOUNT_ID}}-us-west-2
OmicsCicdCommonStack.OmicsTesterRole = arn:aws:iam::{{CICD_AWS_ACCOUNT_ID}}:role/OmicsCicdCommonStack-omicsTesterRoleA7337E5B-t651E9kWmgPf
Stack ARN:
arn:aws:cloudformation:us-west-2:{{CICD_AWS_ACCOUNT_ID}}:stack/OmicsCicdCommonStack/3d9c35a0-cf68-11ee-affe-0ad6f320a581

✨  Total time: n.nns

OmicsCicdPerWorkflowStack
OmicsCicdPerWorkflowStack: deploying... [3/3]

 ✅  OmicsCicdPerWorkflowStack

✨  Deployment time: n.nns

Stack ARN:
arn:aws:cloudformation:us-west-2:{{CICD_AWS_ACCOUNT_ID}}:stack/OmicsCicdPerWorkflowStack/7ecc6590-cf72-11ee-81d9-02e23a17a6d7

✨  Total time: n.nns

testSupportResourcesStack
testSupportResourcesStack: deploying... [1/3]

 ✅  OmicsCicdDeployResourcesStack

✨  Deployment time: n.nns

Stack ARN:
arn:aws:cloudformation:us-west-2:{{PROD_AWS_ACCOUNT_ID}}:stack/OmicsCicdDeployResourcesStack/51356b50-cf76-11ee-8e95-02091ab9daa5

✨  Total time: n.nns
```

You can also verify these stacks using the AWS CLI.

In your `cicd` account use:
```bash
aws cloudformation describe-stacks --profile cicd --query 'Stacks[?starts_with(StackName, `OmicsCicd`)]'
```

In your `prod` account use:
```bash
aws cloudformation describe-stacks --profile prod --query 'Stacks[?starts_with(StackName, `OmicsCicd`)]'
```

## Running the Guidance

To demonstrate running this CI/CD guidance you can use the [NF-Core/FASTQC example-workflow](https://github.com/aws-samples/amazon-omics-tutorials/tree/main/example-workflows/nf-core/workflows/fastqc) available via the [AWS HealthOmics Tutorials](https://github.com/aws-samples/amazon-omics-tutorials) repository. To do this:

1. Add the `nf-core-fastqc` workflow to the deployment configuration.
    
    Edit the `context.workflows` property in the [cdk.json](cdk.json) file to be like:
    ```json
    "workflows": {
        "nf-core-fastqc": "aws-healthomics-nf-core-fastqc"
    }
    ```

2. Add read-only access to the publicly accessible `aws-genomics-static-*` buckets available in all HealthOmics supported AWS regions.

    Edit the `context.source_data_s3_uris` property in the [cdk.json](cdk.json) to be like:
    ```json
    "source_data_s3_uris": [
        "s3://aws-genomics-static-*/*"
    ]
    ```

3. (Re)deploy the guidance by running:
    ```bash
    cd guidance-for-bioinformatics-workflow-ci-cd-on-aws
    npx cdk deploy --profile cicd --all
    ```

4. Get the workflow source and initialize a local git repository

    ```bash
    git clone https://github.com/aws-samples/amazon-omics-tutorials.git
    mkdir -p aws-healthomics-nf-core-fastqc
    cp -Rv amazon-omics-tutorials/example-workflows/nf-core/workflows/fastqc/* aws-healthomics-nf-core-fastqc
    cd aws-healthomics-nf-core-fastqc
    git init
    git add .
    git commit -m "first commit"
    ```

    Pay special attention to these files inside your workflow repository:

    * `nextflow.config`: Update your pipeline version and name in the `manifest` scope to be compatible with semantic versioning (see [Semantic versioning](#semantic-versioning)).  
    * `parameter-template.json`: This is an additional file that is used when deploying the workflow to AWS HealthOmics. It specifies the top level parameters your workflow takes. For more information on what this looks like see [AWS HealthOmics Documentation](https://docs.aws.amazon.com/omics/latest/dev/parameter-templates.html)
    * `test.parameters.json`: This is an additional file that is used to run end-to-end (aka "dynamic") tests of your workflow using AWS HealthOmics. It provides test values for for any required top level parameters for the workflow. Note that any S3 and ECR URIs used should be accessible by AWS HealthOmics and consistent with the region the workflow is deployed to. It can have placeholder variables of `{{region}}` and `{{staging_uri}}` which are replaced with the AWS region name the workflow is tested in, and a deployment generated staging S3 URI used for testing artifacts, respectively.

5. Create a repository for the workflow in CodeCommit

    ```bash
    aws codecommit create-repository \
        --repository-name aws-healthomics-nf-core-fastqc
    ```

6. Push the workflow source to CodeCommit
    > **NOTE:** the following commands leverage the [git-remote-codecommit](https://github.com/aws/git-remote-codecommit) package.

    ```bash
    git remote add codecommit codecommit://aws-healthomics-nf-core-fastqc
    git push -u codecommit main
    ```

7. Review the build and testing stages.
    Pushing the workflow source to CodeCommit will trigger the CodePipeline pipeline for the workflow to run, which should proceed through Source, Build, and Test stages, pausing at Approval.

    ![](./assets/images/codepipeline-execution-example.png)

    You can use the **View details** buttons in each action in each stage to get more information like:
    - Logs for the CodeBuild project
    - Execution details for the dynamic test in StepFunctions 

8. Approve the release.
    Click the **Review** button in the **Approve** action of the **Approve** stage. Select your decision (e.g. "Approve"), optionally add approval comments, and click **Submit**.
    This will transition and deploy the pipeline to your configured `prod` account.


## Next Steps

This guidance uses AWS CodeCommit for source code repositories. If needed you can replace the source repository with your own (e.g. Github, Bitbucket and Gitlab). To learn more about how to do this see [CodeStartSourceConnection action](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodestarConnectionSource.html) details in the [AWS CodePipeline documentation](https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html).


## Cleanup

To remove resources created when deploying this guidance run:
```bash
cd guidance-for-bioinformatics-workflow-ci-cd-on-aws
npx cdk destroy --profile cicd --all
```

**NOTE:** This does not delete any workflow source repositories, released and deployed workflows, nor any workflow data generated during regular use. These items will need to be deleted manually. To learn more, see:
- [AWS CodeCommit: Delete an AWS CodeCommit repository](https://docs.aws.amazon.com/codecommit/latest/userguide/how-to-delete-repository.html)
- [AWS HealthOmics: Deleting workflows and runs](https://docs.aws.amazon.com/omics/latest/dev/deleting-workflows-and-runs.html)
- [Amazon S3: Deleting a bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/delete-bucket.html)

## FAQ, known issues, additional considerations, and limitations (optional)

*“For any feedback, questions, or suggestions, please use the issues tab under this repo.”*

### Additional considerations

- This Guidance creates ECR Private image repositories that may be billed if storing them is [beyond free tier limits](https://aws.amazon.com/ecr/pricing/).
- During operation, this Guildance accumulates build artifacts per released workflow versions in S3. This is intentional and considered best practice for provenance.

### Semantic versioning

When releasing a workflow, [semantic versioning](https://semver.org/) information stored in resource tags and workflow names are used to identify different versions of a workflow.

Branch names and git tags in a code repository are used to generate resource tags and workflow names.

Tags are defined on a specific branch using the following pattern:  

```text
branchName-majorVersion.minorVersion.PatchVersion
```

Artifact (Workflow) names are generated following the pattern:  

```text
workflowName-branchName-majorVersion.minorVersion.PatchVersion
```

Resource tags on workflows encode the following:
* BRANCH
* MAJOR_VERSION
* MINOR_VERSION
* PATCH_VERSION
* COMMIT_ID
* BUILD_SOURCE
* STARTED_BY

`MAJOR_VERSION` and `MINOR_VERION` are derived from the `manifest` scope in the `nextflow.config` file that accompanies a Nextflow based workflow. `PATCH_VERSION`` is automatically generated based on previous git tags in the source code branch that is built.  

`BRANCH`, `COMMIT_ID`, `STARTED_BY`, and `BUILD_SOURCE` are derived from environment variables availabe to the CodeBuild project.

### Branching strategies

Two of the most well known approaches are trunk-based and GitFlow. Both are quite different and have their own implications.

This Guidance is implemented using trunk-based branching.

#### Trunk-based  
Trunk-based development is a version control management practice where developers merge small, frequent updates to a core “trunk” or `main` branch. It streamlines merging and integration phases, and from [this blog](https://aws.amazon.com/blogs/devops/multi-branch-codepipeline-strategy-with-event-driven-architecture/):

> ... trunk-based \[development\] is, by far, the best strategy for taking full advantage of a DevOps approach; this is the branching strategy that AWS recommends to its customers.

It is similar to [GitHub Flow](https://docs.github.com/en/get-started/quickstart/github-flow), with the caveat that only `main` branch is subject to automated build, test and deploy. Similarly, since automation (and potentially deployment to production) is triggered with each new commit, conditions based on git tags are implemented to control when a production release is made.

#### Gitflow
GitFlow is a branching model designed around the project release and provides a robust framework for managing larger projects.

Gitflow is ideally suited for projects that have a scheduled release cycle, but can be complex to implement. For more details see [this blog](https://aws.amazon.com/blogs/devops/multi-branch-codepipeline-strategy-with-event-driven-architecture/).


## Revisions

All notable changes to this project will be documented in this section.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- First release CDK deployment
- First release README

## Notices

*Customers are responsible for making their own independent assessment of the information in this Guidance. This Guidance: (a) is for informational purposes only, (b) represents AWS current product offerings and practices, which are subject to change without notice, and (c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or services are provided “as is” without warranties, representations, or conditions of any kind, whether express or implied. AWS responsibilities and liabilities to its customers are controlled by AWS agreements, and this Guidance is not part of, nor does it modify, any agreement between AWS and its customers.*
