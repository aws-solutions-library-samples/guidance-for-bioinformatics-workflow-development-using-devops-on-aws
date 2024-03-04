#!/bin/bash

CURRBRANCH=$(git rev-parse --abbrev-ref HEAD)
LASTAG=$(git tag --merged ${CURRBRANCH})
if [ -z ${LASTAG} ]
then
      PATCHVER=0
else
      PATCHVER="${LASTAG##*.}"
fi
echo "${PATCHVER}"