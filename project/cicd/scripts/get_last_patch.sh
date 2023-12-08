#!/bin/bash

# Get script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

CURRBRANCH=$(git rev-parse --abbrev-ref HEAD)
LASTAG=$(git tag --merged ${CURRBRANCH})
if [ -z ${LASTAG} ]
then
      PATCHVER=0
else
      PATCHVER="${LASTAG##*.}"
fi
echo "${PATCHVER}"