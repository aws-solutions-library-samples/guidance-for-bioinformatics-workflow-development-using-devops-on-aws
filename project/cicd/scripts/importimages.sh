#!/bin/bash

# Get script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"


# Deploy Omics Helper
cd $BASEDIR
git clone https://github.com/aws-samples/amazon-omics-tutorials.git
HAVEHELPER=$(aws cloudformation list-stacks --output text | grep CREATE_COMPLETE | grep OmxEcrHelper-ContainerBuilder | wc -l)
if [[ "${HAVEHELPER}" -gt 0 ]]
then
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
else
    echo "Omics helper already installed; ignoring..."
fi

# Look for public image references in workflow, generate manifests
cd $WFDIR
python3 $BASEDIR/amazon-omics-tutorials/utils/scripts/inspect_nf.py \
    -n public_registry_properties.json \
    -s container_substitutions.json \
    --output-config-file omics.config \
    --output-manifest-file container_pull_manifest.json \
    .
# Use helper to upload images to ECR
aws stepfunctions start-execution \
    --state-machine-arn arn:aws:states:${AWS_REGION}:${AWS_ACCOUNTID}:stateMachine:omx-container-puller \
    --input file://container_pull_manifest.json

# Uninstall omics helper?
#cdk destroy --all --require-approval never