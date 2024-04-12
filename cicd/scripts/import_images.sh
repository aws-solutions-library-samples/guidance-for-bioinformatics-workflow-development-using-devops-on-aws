#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates.

set -euxo pipefail

DEFAULT_REGISTRY_NAMESPACE="$BASEDIR/amazon-ecr-helper-for-aws-healthomics/lib/lambda/parse-image-uri/public_registry_properties.json"
REGISTRY_NAMESPACE="-n $DEFAULT_REGISTRY_NAMESPACE"
if [[ -f public_registry_properties.json ]]; then
    REGISTRY_NAMESPACE="-n public_registry_properties.json"
fi

SUBSTITUTIONS=""
if [[ -f container_substitutions.json ]]; then
    SUBSTITUTIONS="-s container_substitutions.json"
fi

# Look for public image references in workflow, generate manifests
cd $WFDIR
ls -lah 
mkdir -p $WFDIR/conf
python3 $BASEDIR/amazon-omics-tutorials/utils/scripts/inspect_nf.py \
    $REGISTRY_NAMESPACE \
    $SUBSTITUTIONS \
    --output-config-file $WFDIR/conf/omics-images.config \
    --output-manifest-file $WFDIR/container_pull_manifest.json \
    $WFDIR
# Use helper to upload images to ECR
SFN_EXEC_ARN=$(aws stepfunctions start-execution \
    --state-machine-arn arn:aws:states:${AWS_REGION}:${ACCOUNT_ID}:stateMachine:omx-container-puller \
    --input file://container_pull_manifest.json | jq .executionArn | tr -d "'\"")

# Check if helper state machine has completed 
MAXTIME=$((SECONDS+3600))
CHECK_FREQUENCY=15
while [ $SECONDS -lt $MAXTIME ]; do
  # check every 15 seconds
  sleep $CHECK_FREQUENCY
  STATUS=$(aws stepfunctions describe-execution --execution-arn ${SFN_EXEC_ARN} | jq .status | tr -d "'\"")
  if [ $STATUS == 'SUCCEEDED' ]; then
    echo "Step Function execution completed successfully"
    break
  elif [ $STATUS == 'RUNNING' ]; then
    echo "Step function RUNNING"
  else
    echo "Step function did not run successfully, status: $STATUS"
    break
  fi;
done;

# write step function output to file
aws stepfunctions describe-execution --execution-arn ${SFN_EXEC_ARN} | jq > omx_container_puller_execution_report.json

# Include omics.config in workflow config
if ! grep "omics-images.config" $WFDIR/nextflow.config
then
    echo "includeConfig 'conf/omics-images.config'" >> $WFDIR/nextflow.config
fi
cat $WFDIR/nextflow.config

# Uninstall omics helper?
#cdk destroy --all --require-approval never