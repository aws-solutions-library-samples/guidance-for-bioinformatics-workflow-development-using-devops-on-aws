import logging
import boto3
from botocore.exceptions import ClientError
import json
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

def get_bucket_key(s3_path):
    s3_path_parts = s3_path.split('/')
    bucket = s3_path_parts[2]
    key = '/'.join(s3_path_parts[3:])
    return bucket, key

def download_file(bucket, key, filename):
    s3 = boto3.client('s3')
    try:
        response = s3.download_file(bucket, key, filename)
    except ClientError as e:
        raise Exception( f"download 's3://{bucket}/{key}' : boto3 client error : " + e.__str__())
    except Exception as e:
       raise Exception( f"download 's3://{bucket}/{key}' : Unexpected error : " +    e.__str__())
    logger.info(response)
    return filename

def handler(event, context):
    omics_session = boto3.Session()
    omics_client = omics_session.client('omics')
    workflow_id = event['WorkflowId']
    commit_id = event['CommitId']
    params_file = event['WorkflowParamsFile']
    role_arn = event['JobRoleArn']
    output_s3_path = event['OutputS3Path']

    url = urlparse(event['WorkflowStagingS3Path'])
    __bucket = url.netloc
    __prefix = url.path.lstrip('/').rstrip('/')
    __key = f"{__prefix}/{commit_id}/{params_file}"

    params_file = download_file(__bucket,__key,'/tmp/params.json')

    with open(params_file) as f:
        params = json.load(f)

    try:
        print("Attempt to start workflow run")
        response = omics_client.start_run(
            workflowId=workflow_id,
            name="test-run-" + workflow_id + "-" + commit_id,
            roleArn=role_arn,
            parameters=params,
            outputUri=output_s3_path
            )
    except ClientError as e:
        raise Exception( "boto3 client error : " + e.__str__())
    except Exception as e:
       raise Exception( "Unexpected error : " +    e.__str__())
    logger.info(response)
    return {"WorkflowRunId": response['id']}