# Welcome to AWS HealthOmics CI/CD pipelines

## Introduction  
Secondary analysis pipelines in omics are software, and like any other software product they have versions that need to be tracked, tested, and released when ready for wider use. This also applies to [AWS HealthOmics](https://aws.amazon.com/healthomics/) workflows.  A public example of this are NF-Core pipelines that tend to have new releases on a rolling basis. Building, testing, and deploying new workflow versions is undifferentiated heavy lift. The goal of this solution to make the cloud resources for automated testing and deployment of secondary analysis (and other bioinformatics) pipelines easy to acquire, provision, and use.

The steps involved are generally the same across all organizations:

1. A new version of the workflow definition is committed to source code version control (e.g. Git).  
2. Any components of the definition that need to be built are processed - e.g. tooling containers.  
3. Components are then staged to corresponding AWS services for testing: containers to ECR, workflow to AWS HealthOmics...  
4. A first static test is performed on the pushed code to quickly detect any major issues.   
5. Once passed, the workflow is dynamically tested to ensure it performs as expected and there are no regressions in existing capabilities. Test data is used for this, ideally using a small dataset so tests complete quickly.  
6. If any tests fail a new version of the workflow is required. Developers generate this and start back at step 1.  
7. If all tests pass, a new release version is assigned to the commit, and the workflow is deployed to the next phase (e.g. production staging).  

The steps above are conceptually no different that those taken for other software products. The primary difference is the time scale involved. Workflow run times are dependent on the size of input data used, and test driven iteration times can be on the order of hours. Optimizing iteration times is out of scope for this solution. 

**Features provided by this solution:**
* Release process and notification  
* Semantic Versioning  
* Cross Account deployments  
    * secure build  
    * environment isolation  
    * safe deployments  

## Prerequisites  

* Two (or more) AWS accounts - e.g. one for "ci/cd" and one for "production". Therein:
  * AdministratorAccess policy granted to your calling identity (for production, we recommend restricting access as needed)  
  * Both console and programmatic access 
* NodeJS 20 or higher (LTS versions are recommended)
* [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html)
* [AWS CDK](https://aws.amazon.com/cdk/) v2.128.x or higher
* Python 3.9 or higher

## Installation  

```bash
npm install && npm run build
```

## CDK bootstrapping 
Select at least two AWS accounts to deploy the solution into. By default, this project works with one CI/CD and one deployment (e.g. production) account, but can be extended to work with additional accounts.

Before deploying this solution, each target account needs to be "bootstrapped" by the AWS CDK. Bootstrapping provisions resources used by the AWS CDK to deploy AWS CDK apps into an AWS environment. (An AWS environment is a combination of an AWS account and Region). These resources include an Amazon S3 bucket for storing files and IAM roles that grant permissions needed to perform deployments.  

Because this solution leverages cross-account access, the bootstrap process is a little more complex than a single-account case, requiring creating trust relationships between accounts.  

### Configure AWS CLI profiles for all accounts
The AWS CDK uses AWS CLI profiles to access an AWS environment. By default, this is the `default` profile that is created. Here, profiles for `cicd` and `production` need to be configured.

Using the AWS CLI:
```bash
aws configure --profile cicd
# ... follow CLI prompts to complete process

aws configure --profile prod
# ... follow CLI prompts to complete process
```

If you have existing profiles for AWS accounts you want to use for for this solution you can either:
- Substitute `cicd` and `prod` where appropriate in subsequent instructions
- Create aliases to these profiles in your `~/.aws/config` and `~/.aws/credentials` files as appropriate

### Run `cdk bootstrap`

Do this outside of the project folder, like your home folder (`~`).

Start by bootstrapping the `cicd` account. This is the account that will contain workflow and container source code, run tests, and deploy to other accounts.
```bash
cd ~
cdk bootstrap 
    --profile cicd 
    aws://<CICD_AWS_ACCOUNT_ID>/<AWS_REGION> 
    --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

Next bootstrap the `prod` account. This account will have "released" workflows deployed into it. Thus, it need needs to have a trust relationship with the `cicd` account (that account that invokes the deployment).

```bash
cd ~
cdk bootstrap 
    --profile prod 
    --trust <CICD ACCOUNT_ID> 
    aws://<PROD_AWS_ACCOUNT_ID>/<AWS_REGION> 
    --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

## Configuration

### Add AWS accounts
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

### Add workflow source repositories
Edit the `context.workflows` property in the [cdk.json](cdk.json) file. This is a mapping of workflow names and their corresponding CodeCommit repository names.

For example:
```
"workflows": {
    "nf-workflow-a": "codecommit-repo-nf-workflow-a",
    "nf-workflow-b": "codecommit-repo-nf-workflow-b",
    ... 
}
```

The CodeCommit repositories can be ones that already exist in your `cicd` account or ones you plan to create later.

## Deployment 

The following command will deploy resources in your CI/CD, testing, and production accounts:  
  
```bash
npx cdk deploy --profile cicd --all
```

If you update any of the workflows or accounts used by the solution, you will need to redeploy by running the above command again.

## Workflow Setup  
  
> **NOTE:** This project currently supports only Nextflow based pipelines.

During deployment, the following resources are created for each workflow listed in `context.workflows`:
- An AWS CodeBuild project to build workflow artifacts like containers
- An AWS CodeBuild project to deploy the workflow and artifacts to testing and production environments.
- An AWS CodePipeline pipeline to coordinate testing and deployment of the workflow

For "Source", the CodePipeline pipeline references the AWS CodeCommit repository by name, and will be triggered to run with any commited changes to the `main` branch therein.

If this repository does not exist, you need to create it. For testing and demonstration purposes, you can use the [NF-Core/FASTQC example-workflow](https://github.com/aws-samples/amazon-omics-tutorials/tree/main/example-workflows/nf-core/workflows/fastqc) available via the [AWS HealthOmics Tutorials](https://github.com/aws-samples/amazon-omics-tutorials) repository.

To do this:

1. Get the workflow and initialize a local git repository

```bash
git clone https://github.com/aws-samples/amazon-omics-tutorials.git
mkdir -p aws-healthomics-nf-core-fastqc
cp -Rv amazon-omics-tutorials/example-workflows/nf-core/workflows/fastqc/* aws-healthomics-nf-core-fastqc
cd aws-healthomics-nf-core-fastqc
git init
git add .
git commit -m "first commit"
```

2. Create the repository in CodeCommit

```bash
aws codecommit create-repository \
    --repository-name aws-healthomics-nf-core-fastqc
```

3. Push the clone to CodeCommit
> **NOTE:** the following commands leverage the [git-remote-codecommit](https://github.com/aws/git-remote-codecommit) package.

```bash
git remote add codecommit codecommit://aws-healthomics-nf-core-fastqc
git push -f codecommit main
```

You can also replace the source repository with your own (Github, Bitbucket and Gitlab), just edit the source stage at the deployed aws CodePipeline pipeline.

Pay special attention to these files inside your workflow repository:

* All workflow definition files should be placed in a folder under the root of the project named `workflow`.  
* `workflow/nextflow.config`: Update your pipeline version and name in the `manifest` scope to be compatible with semantic versioning (see below).  
* `workflow/parameter-template.json`: This is an additional file that is used when deploying the workflow to AWS HealthOmics. It specifies the top level parameters your workflow takes. For more information on what this looks like see [AWS HealthOmics Documentation](https://docs.aws.amazon.com/omics/latest/dev/parameter-templates.html)
* `workflow/test.parameters.json`: This is an additional file that is used to run end-to-end (aka "dynamic") tests of your workflow using AWS HealthOmics. It provides test values for for any required top level parameters for the workflow. Note that any S3 and ECR URIs used should be accessible by AWS HealthOmics and consistent with the region the workflow is deployed to.


## Semantic versioning  

Artifacts in this project are generated in the form of aws healthomics worflows.  

Semantic versioning information in resource tags and workflow names are used to identify different versions of a workflow.

Branch names and git tags in a code repository are used to generate resource tags and workflow names.

Tags are defined on a specific branch using the following pattern:  
```branchName-majorVersion.minorVersion.PatchVersion```  
For example: lgg_iac-3.1.27  

Artifact (Workflow) names are generated following the pattern:  

```workflowName-branchName-majorVersion.minorVersion.PatchVersion```  
For example:
RNAseqQC-lgg_iac-3.1.27  

Artifact tags use the following information:
* WORKFLOW
* BRANCH
* MAJOR_VERSION
* MINOR_VERSION
* PATCH_VERSION
* COMMIT_ID
* BUILD_SOURCE
* STARTED_BY

The workflow, major and minor version are taken from buildspec-build.yaml file in the CodeBuild project.  
Branch, commit_id and build_source are taken from environment variables.
Patch version is automatically generated based on previous tags in the branch.  
  
## About Branch Strategies  
  
Different teams follow different strategies; this is really up to each organization.  
Two of the most well known approaches are trunk-based and GitFlow.  Both are quite different and have its implications.  
   
### Gitflow
GitFlow is a branching model designed around the project release. This provides a robust framework for managing larger projects.  
Gitflow is ideally suited for projects that have a scheduled release cycle, but it’s not straight to use with aws CI/CD tools, and that’s why we have some solutions like [this](https://aws.amazon.com/blogs/devops/multi-branch-codepipeline-strategy-with-event-driven-architecture/)  
But this approach is too complex, and hence fragile.  
  
### Trunk-based  
Trunk-based development is a version control management practice where developers merge small, frequent updates to a core “trunk” or main branch. It streamlines merging and integration phases, and as the above mentioned blogpost says: *“It’s important to note that trunk-based is, by far, the best strategy for taking full advantage of a DevOps approach; this is the branching strategy that AWS recommends to its customers. On the other hand, many customers like to work with multiple branches and believe it justifies the effort and complexity in dealing with branching merges. This solution is for these customers.”*  
It's similar to [GitHub Flow](https://docs.github.com/en/get-started/quickstart/github-flow).  
The downside is that in this case, only main branch is subject to automated build, test and deploy.  
This limits the ways teams can take advantage of automation when working on different independent lines.  
  
A solition for this could be but combine it later with tests launched from the developers workstations when working on development branches.  
These tests would emulate what the build pipeline does, using IaC and probably CDK, but on the developer’s accounts, and launched from the developer’s workstation.  
  
Deployment to production account is triggered when a new commit is sent to the main branch, and it could apply a condition for a git tag following a defined pattern.  
This is [supported](https://aws.amazon.com/about-aws/whats-new/2023/10/aws-codepipeline-triggering-git-tags/) by codepipelines V2, but CDK currently only supports pipelines V1.  
So we implemented triggers for every commit and conditions for tags.  

## Running workflows  
During test stage, your workflow is executed, using the parameters specified in your project.  
Any sample files for testing should be placed in the testFilesBucket deployed as part of the cdk stacks.  Otherwise, you will need to grant access to the buckets you defined as input in your testing configuration in the `workflow/test.parameters.json` of your code repository.  

When running your workflows in production, there is not a default bucket for input files, so you will have to grant manually AWS HealthOmics service role permissions to access the input and output buckets you specified in the parameters of your runs.  

### Issues:
**Problem** 
Can't use parameters, because cdk creates an additional stack, which doesn't accept it  
```
EventBusPolicy-<account1>-us-east-1-<account2> (OmicsDeployPipelinesStack-EventBusPolicy-support-us-east-1-<account1>) failed: Error [ValidationError]: Parameters: [workflowName] do not exist in the template
```
**Solution**  
Edit [bin/cdk.ts](bin/cdk.ts) file locally and add it  

**Problem**  
Cross-account events for codecommit tigger on deployment account fail to deploy:  
4:03:43 PM | CREATE_FAILED        | AWS::Events::Rule           | workflowscodegitOm...nEventRuleB653F5F6
Resource handler returned message: "RoleArn is required for target arn:aws:events:us-east-1:xxxxxxxxxxxx:event-bus/default. (Service: EventBridge, Status Code: 400, Request ID: 609c5786-5479-4e98-b6fa-7ab3267ddfb1)" (RequestToken: b3e801da-75b3-91dd-0b63-568fc5427130, HandlerErrorCode: GeneralService
Exception)


 ❌  OmicsBuildPipelinesStack failed: Error: The stack named OmicsBuildPipelinesStack failed to deploy: UPDATE_ROLLBACK_COMPLETE: Resource handler returned message: "RoleArn is required for target arn:aws:events:us-east-1:xxxxxxxxxxxx:event-bus/default. (Service: EventBridge, Status Code: 400, Request ID: 609c5786-5479-4e98-b6fa-7ab3267ddfb1)" (RequestToken: b3e801da-75b3-91dd-0b63-568fc5427130, HandlerErrorCode: GeneralServiceException)

**Solution**  
Try using CDK pipelines  

