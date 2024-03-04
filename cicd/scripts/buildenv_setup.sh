#!/bin/bash

BASEDIR=$1

echo "OS Environment Setup"

# Install aws tools
yum install awscli -y
yum install jq -y
pip3 install boto3
pip install git-remote-codecommit

# Install Nextflow
#sdk install java 17.0.6-amzn
#sdk use java 17.0.6-amzn
export CAPSULE_LOG=none
wget -qO- https://get.nextflow.io | bash
export PATH=$PATH:$(pwd)/nextflow

# Deploy Omics Helper inf not present in account...
cd $BASEDIR
git clone https://github.com/aws-samples/amazon-omics-tutorials.git
HAVEHELPER=$(aws cloudformation list-stacks --output text | grep CREATE_COMPLETE | grep OmxEcrHelper-ContainerBuilder | wc -l)
# Skip this installation check,
#  cdk is idempotent here and  this way we could keep the helper up to date
if [[ "${HAVEHELPER}" -eq 0 ]]
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
    echo "Omics helper already installed in this account"
fi