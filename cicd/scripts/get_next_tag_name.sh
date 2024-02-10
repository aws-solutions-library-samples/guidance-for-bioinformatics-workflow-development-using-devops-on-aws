#!/bin/bash

# patch version from arguments
LASTPATCHVER=$1
NEWPATCHVER=$((LASTPATCHVER+1))

# Get script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Get current branch name
CURRBRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ ! -z ${NEWPATCHVER}  ] && [ ! -z ${MAJORV} ] && [ ! -z ${MINORV} ] && [ ! -z ${CODEBUILD_RESOLVED_SOURCE_VERSION} ]
then
      TAGNAME="${CURRBRANCH}-${MAJORV}.${MINORV}.${NEWPATCHVER}"
      echo "${TAGNAME}"
else
      exit 1
fi