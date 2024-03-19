#!/bin/bash

# BUILD version from arguments
# Get current branch name
CURRBRANCH=$(git rev-parse --abbrev-ref HEAD)
LASTAG=$(git tag --merged ${CURRBRANCH})
if [ -z ${LASTAG} ]
then
      LASTBUILDVER=0
else
      LASTBUILDVER="${LASTAG##*.}"
fi

# Generate new build version
NEWBUILDVER=$((LASTBUILDVER+1))

if [ ! -z ${NEWBUILDVER}  ] && [ ! -z ${MAJORV} ] && [ ! -z ${MINORV} ] && [ ! -z ${PATCHV} ] && [ ! -z ${CODEBUILD_RESOLVED_SOURCE_VERSION} ]
then
      TAGNAME="${CURRBRANCH}-${MAJORV}.${MINORV}.${PATCHV}.${NEWBUILDVER}"
      echo "${TAGNAME}"
else
      exit 1
fi