#!/bin/bash

# Get script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"


# Deploy Omics Helper inf not present in account...
cd $BASEDIR
git clone https://github.com/aws-samples/amazon-omics-tutorials.git
HAVEHELPER=$(aws cloudformation list-stacks --output text | grep CREATE_COMPLETE | grep OmxEcrHelper-ContainerBuilder | wc -l)
# Skip this installation check,
#  cdk is idempotent here and  this way we could keep the helper up to date
echo "Installing omics helper..."
npm install aws-cdk -g
alias cdk='npx aws-cdk'

npm install ts-node -g
npm install aws-cdk-lib -g
npm install fs -g
npm update -g aws-cdk

cd amazon-omics-tutorials
git pull origin
cd utils/cdk/omx-ecr-helper
npm install
cdk deploy --all --require-approval never

# Look for public image references in workflow, generate manifests
cd $WFDIR
mkdir -p $WFDIR/conf
python3 $BASEDIR/amazon-omics-tutorials/utils/scripts/inspect_nf.py \
    -n public_registry_properties.json \
    -s container_substitutions.json \
    --output-config-file $WFDIR/conf/omics.config \
    --output-manifest-file $WFDIR/container_pull_manifest.json \
    .
# Use helper to upload images to ECR
aws stepfunctions start-execution \
    --state-machine-arn arn:aws:states:${AWS_REGION}:${AWS_ACCOUNTID}:stateMachine:omx-container-puller \
    --input file://container_pull_manifest.json

# Include omics.config in workflow config
HAVECONFIG=$(grep "omics.config" $WFDIR/nextflow.config  | wc -l)
if [[ "${HAVECONFIG}" -eq0 ]]
then
    echo "includeConfig 'conf/omics.config'" >> $WFDIR/nextflow.config
fi

# Uninstall omics helper?
#cdk destroy --all --require-approval never