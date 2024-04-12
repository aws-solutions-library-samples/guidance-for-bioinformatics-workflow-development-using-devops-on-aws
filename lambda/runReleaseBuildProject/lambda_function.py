# Copyright Amazon.com, Inc. or its affiliates.

import boto3
import urllib.parse
import json
import logging
import os

def lambda_handler(event, context):

    logger = logging.getLogger('omics_workflow_release_lambda')
    logger.setLevel(logging.DEBUG)

    # Print event for debug
    logger.debug(json.dumps(event))

    # Get workflow, version parameters from artifact
    file_bucket = event['Records'][0]['s3']['bucket']['name']
    file_key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')

    file_path = file_key.split(os.sep)
    workflow_name=file_path[2]
    project_branch=file_path[3]
    workflow_version=file_path[4]
    release_project_name='release_project'
    
    logger.debug('workflow name is '+workflow_name)
    logger.debug('workflow version is '+workflow_version)
    
    # Launch CodeBuild action to deploy artifact
    client = boto3.client(service_name='codebuild')    
    logger.debug('Launching CodeBuild Project '+release_project_name)
    release_build = client.start_build(
        projectName=release_project_name,
        artifactsOverride={
            'type': 'NO_ARTIFACTS'
        },  
        environmentVariablesOverride=[
        {
            'name': 'artifactBucket',
            'value': file_bucket,
            'type': 'PLAINTEXT'
        },
        {
            'name': 'artifactKey',
            'value': file_key,
            'type': 'PLAINTEXT'
        },
        {
            'name': 'cicdACCOUNT',
            'value': os.environ['CICD_ACCOUNT_ID'],
            'type': 'PLAINTEXT'
        },
        {
            'name': 'workflowName',
            'value': workflow_name,
            'type': 'PLAINTEXT'
        },
        {
            'name': 'projectBranch',
            'value': project_branch,
            'type': 'PLAINTEXT'
        },
        {
            'name': 'workflowVersion',
            'value': workflow_version,
            'type': 'PLAINTEXT'
        }
    ]
    )
    
    
    return {
        'statusCode': 200,
        'body': json.dumps('Healthomics workflow release launched!')
    }