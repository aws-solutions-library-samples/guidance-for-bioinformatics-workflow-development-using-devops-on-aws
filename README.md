# Welcome to AWS HealthOmics CI/CD pipelines

The resources for this project can be deployed using cdk.  

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Deployment  

### Prerequisites  

* An AWS account  
* AdministratorAccess policy granted to your AWS account (for production, we recommend restricting access as needed)  
* Both console and programmatic access  
* NodeJS 16 or 18 installed  
* AWS CLI installed and configured to use with your AWS account  
* Typescript 3.8+ installed  
* AWS CDK CLI installed  
* Python 3+ installed  

### Installation  

```bash
npm install && npm run build
```

** cdk bootstrapping **  
  
Bootstrapping is the process of provisioning resources for the AWS CDK before you can deploy AWS CDK apps into an AWS environment. (An AWS environment is a combination of an AWS account and Region).  
These resources include an Amazon S3 bucket for storing files and IAM roles that grant permissions needed to perform deployments.  
  
```bash
cdk bootstrap aws://ACCOUNT-NUMBER-1/REGION-1 aws://ACCOUNT-NUMBER-2/REGION-2 ...
# alternatively, you can use aws profiles:
cdk bootstrap --profile prod
```
  
** Project deployment ** 
   
Given you have aws cli and cdk installed in your machine, and you have a default aws profile configured,  
the following command will deploy the project resources in your account:  
  
```bash
npx cdk deploy
```

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
