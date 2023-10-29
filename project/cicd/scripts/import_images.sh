#!/bin/bash

# Get script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Look for public image references in workflow, generate manifests
cd $WFDIR
mkdir -p $WFDIR/conf
python3 $BASEDIR/amazon-omics-tutorials/utils/scripts/inspect_nf.py \
    -n public_registry_properties.json \
    -s container_substitutions.json \
    --output-config-file $WFDIR/conf/omics-images.config \
    --output-manifest-file $WFDIR/container_pull_manifest.json \
    .
# Use helper to upload images to ECR
aws stepfunctions start-execution \
    --state-machine-arn arn:aws:states:${AWS_REGION}:${ACCOUNT_ID}:stateMachine:omx-container-puller \
    --input file://container_pull_manifest.json

# Include omics.config in workflow config
HAVECONFIG=$(grep "omics-images.config" $WFDIR/nextflow.config  | wc -l)
if [[ "${HAVECONFIG}" -eq 0 ]]
then
    echo "includeConfig 'conf/omics-images.config'" >> $WFDIR/nextflow.config
fi

# Uninstall omics helper?
#cdk destroy --all --require-approval never