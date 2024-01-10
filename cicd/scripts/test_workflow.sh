#!/bin/bash
cd $BASEDIR

LAUNCHED="y"
WORKFLOW_RUN_ID=$(aws omics start-run \
        --workflow-id ${WFID} \
        --name build-test \
        --parameters file://${WFDIR}/test.parameters.json \
        --output-uri s3://${TESTS_BUCKET_NAME}/output/Sample \
        --role-arn ${OMICS_TESTER_ROLE_ARN} \
        --query 'id' \
        --output text \
) || LAUNCHED="n"

# Function to delete workflow
delete_workflow() {
    echo "Deleting temporary workflow with ARN ${WFARN}"
    aws omics delete-workflow --id $WFID
}

if [[ "${LAUNCHED}" = "n" ]]
then
    echo "Workflow failed to launch."    
    delete_workflow
    exit 1
fi

# Continue if workflow has been launched...
echo "Launched workflow $WORKFLOW_RUN_ID"

# Poll for the run to finish
while [[ "${RUNSTATUS}" != "COMPLETED" && "${RUNSTATUS}" != "FAILED"  ]]
do
    RUNSTATUS=$(aws omics get-run --id $WORKFLOW_RUN_ID --query 'status' --output text)
    echo "### Run id ${WORKFLOW_RUN_ID} state is ${RUNSTATUS}..."
    # Omics CLI wait breaks after 20 iterations; could be configured in python
    # for simplicity we add polling loop here
    #aws omics wait run-completed --id $WORKFLOW_RUN_ID
    sleep 120s
done

if [[ "${RUNSTATUS}" = "COMPLETED" ]]
then
    echo "Workflow completed successfully."
    exit 0
else
    echo "Workflow failed to complete."
    delete_workflow
    exit 1
fi        

