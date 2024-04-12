#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates.

set -euxo pipefail

# build version from arguments
NEXTBUILDVER=$1

echo "Tagging commit with ${NEXTBUILDVER}"

# Get current branch name
CURRBRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ ! -z ${NEXTBUILDVER}  ] && [ ! -z ${MAJORV} ] && [ ! -z ${MINORV} ] && [ ! -z ${PATCHV} ] && [ ! -z ${CODEBUILD_RESOLVED_SOURCE_VERSION} ]
then
      TAGNAME="${CURRBRANCH}-${MAJORV}.${MINORV}.${PATCHV}.${NEXTBUILDVER}"
      echo "${TAGNAME}"
      git tag -a ${TAGNAME} -m "CodeBuild generated tag" $CODEBUILD_RESOLVED_SOURCE_VERSION
      git push origin --tags
else
      exit 1
fi