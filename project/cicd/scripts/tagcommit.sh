#!/bin/bash

# patch version from arguments
NEWPATCHVER=$1

# Get script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Get current branch name
CURRBRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ ! -z ${NEWPATCHVER}  ] && [ ! -z ${workflow_major_version} ] && [ ! -z ${workflow_minor_version} ] && [ ! -z ${CODEBUILD_RESOLVED_SOURCE_VERSION} ]
then
      TAGNAME="${CURRBRANCH}-${workflow_major_version}.${workflow_minor_version}.${NEWPATCHVER}"
      echo "${TAGNAME}"
      git tag -a ${TAGNAME} $CODEBUILD_RESOLVED_SOURCE_VERSION
else
      exit 1
fi