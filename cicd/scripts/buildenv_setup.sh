#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates.

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
mkdir -p $BASEDIR/bin
cd $BASEDIR/bin
export CAPSULE_LOG=none
wget -qO- https://get.nextflow.io | bash
export PATH=$PATH:$(pwd)/nextflow

# Get amazon-omics-tutoarials. Utility script inspect_nf.py is used for build.
cd $BASEDIR
git clone https://github.com/aws-samples/amazon-omics-tutorials

# Deploy Omics Helper if not present in account...
cd $BASEDIR
git clone https://github.com/aws-samples/amazon-ecr-helper-for-aws-healthomics.git
echo "Installing omics helper..."
npm install aws-cdk -g
alias cdk='npx aws-cdk'

npm install ts-node -g
npm install aws-cdk-lib -g
npm install fs -g
npm update -g aws-cdk

cd amazon-ecr-helper-for-aws-healthomics
npm install
cdk deploy --all --require-approval never