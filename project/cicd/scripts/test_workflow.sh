#!/bin/bash
cd $BASEDIR
SUCCESS="y"
WORKFLOW_RUN_ID=$(aws omics start-run \
        --workflow-id ${WFID} \
        --name run-one \
        --parameters file://${WFDIR}/workflow-parameters.json \
        --output-uri s3://${TESTS_BUCKET_NAME}/output/Sample \
        --role-arn ${OMICS_TESTER_ROLE_ARN} \
        --query 'id' \
        --output text \
) || SUCCESS="n"

if [[ "${SUCCESS}" = "y" ]]
then
    echo "Launched workflow $WORKFLOW_RUN_ID"
    # Here we should poll for the workflow to finish correctly
    aws omics describe-run --id $WORKFLOW_RUN_ID
    # Once finished correctly, tag repo for future deployment
    exit 0
else
    echo "Error running workflow."    
    echo "Tests failed, delete temporary workflow with ARN ${WFARN}"
    aws omics delete-workflow --id $WFID
    exit 0
fi
