#!/bin/bash

# BUILD version from arguments
# Get current branch name
CURRBRANCH=$(git rev-parse --abbrev-ref HEAD)
# Get list of tags for current branch and defined version
LASTAG=$(git tag -l ${CURRBRANCH}-${MANIFESTVER}\* --merged ${CURRBRANCH} | sort -n)
# No tags found, then set build version to 0
if [ -z ${LASTAG} ]
then
      LASTBUILDVER=0
# If there are tags, then get build version from last tag
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