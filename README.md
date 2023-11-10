# Welcome to AWS HealthOmics CI/CD pipelines

The resources for this project can be deployed using cdk.  

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Deployment  

### Prerequisites  

* Two (or more) AWS accounts  
* AdministratorAccess policy granted to your AWS account (for production, we recommend restricting access as needed)  
* Both console and programmatic access  
* NodeJS 16 or 18 installed  
* AWS CLI installed and configured to use with your AWS account  
* Typescript 3.8+ installed  
* AWS CDK CLI installed  
* Python 3+ installed  

### Installation  

```bash
npm install && npm run build
```

**cdk bootstrapping**  
  
Choose two (or more) aws accounts to deploy the resources:  
| aws account# | purpose | alias |  |  |
|---|---|---|---|---|
| xxxxxxxxxxxx | CI/CD tooling | CI/CD |  |  |
| xxxxxxxxxxxx | deployment account 1 | PROD |  |  |
  
By default, this project works with CI/CD and one (production) deployment account, but it can be easily extended to work with additional accounts.  
Once you have chosen the accounts and have its account numbers, it's time to bootstrap them.  
Bootstrapping is the process of provisioning resources for the AWS CDK before you can deploy AWS CDK apps into an AWS environment. (An AWS environment is a combination of an AWS account and Region).  
These resources include an Amazon S3 bucket for storing files and IAM roles that grant permissions needed to perform deployments.  
The bootstrap process for this cross-account setup will be more complex than in a single-account case, because we must define the trust relationships between accounts.  
First, make sure you have defined in your workstation profiles for all the accounts.  
As an example, we can name the aws profiles for the accounts `cicd`, `dev` or `pro`.
Follow this procedure:  

```bash
cdk bootstrap --profile cicd --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
npx cdk bootstrap --profile pro --trust <CICD ACCOUNT_ID> aws://<PRO ACCOUNT_ID>/us-east-1 --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```
  
Now it's time to configure the accounts in our cdk environments.  
Edit [bin/omics-cicd.ts](bin/omics-cicd.ts) file locally, and configure the aws account numbers and region for each environment.  
In this example, there are 2 accounts (deployment stages) in the list.  
You can add more accounts for testing or other purposes to the pipeline by just including them in deployEnvironments property.  
Just remember to bootstrap those accounts as well.  
    
> [!WARNING]  
> Always remove the account numbers and emails from those edited files before sharing them (pushing to a public repo).  
  
**Project deployment** 

Given you have aws cli and cdk installed in your machine, define your default aws profile to use CI/CD account, or specify it using --profile option.  
The following command will deploy the project resources in your CI/CD account:  
  
```bash
npx cdk deploy --profile cicd
```

Once the deployment finishes, you don't need to use cdk again unless you want to update the pipelines, buckets or other components included in the stacks.  
You can also deploy multiple stacks for different workflows and branches.  Just edit file [bin/omics-cicd.ts](bin/omics-cicd.ts) and change worflowName and projectBranch properties.  When launched, this will generate dedicated repositories, pipelines, roles buckets, etc.  

**Workflow Setup**  
  
This project currently supports only nextflow pipelines.  
It comes with a preconfigured workflow definition, under [project/workflow](project/workflow) folder.  
The contents of this folder will be uploaded to the codecommit repository created by cdk, and used as source for the Amazon Healthomics custom workflow deployment.  
Replace this folder contents with your own nextflow project, paying special attention to the next files:  
* [project/workflow/nextflow.config](project/workflow/nextflow.config): Update your pipeline version and name so we can follow semantic versioning (see below).  
* [ project/workflow/test.parameters.json ](project/workflow/test.parameters.json): Update with the bucket and testing file location for the dynamic tests.  
* [project/workflow/parameter-template.json](project/workflow/parameter-template.json): Update with the template for the parameters your workflow is taking.  
You can also change the workflow files once they are in the newly created codecommit git repository.  
Every time you push a change to the branch tracked by codepipeline, a new build and release process will be triggered.  

---
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
  
---
## About Branch Strategy  
  
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
  
Deployment to production account is triggered when a new commit is sent to the main branch, and it has a git tag following a pattern (TBD).  
This is [supported](https://aws.amazon.com/about-aws/whats-new/2023/10/aws-codepipeline-triggering-git-tags/) by codepipelines V2, but CDK currently only supports pipelines V1.  
So we implemented triggers for every commit and conditions for tags.  


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

