#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates.

# Script to set the environment variables for the workflow version
# This script takes information from the workflow manifest and sets the environment variables accordingly
# It currently only supports the version pattern Major.minor.patch from nextflow.config manifest
# If the pattern is not found, the script exits with an error
# TODO: Add support for other workflow languages (WDL, CWL)

export MANIFESTVER=$(grep -E "\s+version\s+=\s*'.*?'" $WFDIR/nextflow.config | cut -d\' -f2)
if [[ "$MANIFESTVER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    export MAJORV=$(echo ${MANIFESTVER} | cut -d. -f1)
    export MINORV=$(echo ${MANIFESTVER} | cut -d. -f2)
    export PATCHV=$(echo ${MANIFESTVER} | cut -d. -f3)
else
    echo "Version in workflow manifest ${MANIFESTVER} doesn't match Major.minor.patch pattern."
    exit 1
fi