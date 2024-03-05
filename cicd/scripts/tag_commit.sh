#!/bin/bash
set -euxo pipefail

# patch version from arguments
NEXTPATCHVER=$1

echo "Tagging commit with ${NEXTPATCHVER}"

# Get current branch name
CURRBRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ ! -z ${NEXTPATCHVER}  ] && [ ! -z ${MAJORV} ] && [ ! -z ${MINORV} ] && [ ! -z ${CODEBUILD_RESOLVED_SOURCE_VERSION} ]
then
      TAGNAME="${CURRBRANCH}-${MAJORV}.${MINORV}.${NEXTPATCHVER}"
      echo "${TAGNAME}"
      git tag -a ${TAGNAME} -m "CodeBuild generated tag" $CODEBUILD_RESOLVED_SOURCE_VERSION
      git push origin --tags
else
      exit 1
fi