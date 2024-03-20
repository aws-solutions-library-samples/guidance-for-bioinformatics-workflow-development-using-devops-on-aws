import json
import sys
import argparse
import boto3
from botocore.exceptions import ClientError
import logging
import os

X_ACCOUNT_POLICY_TEMPLATE="""{
    "Version" : "2008-10-17",
    "Statement" : [
        {
            "Sid" : "Allow x-account access",
            "Effect" : "Allow",
            "Principal" :
            {
                "AWS" : []
            },
            "Action" : [
                "ecr:BatchCheckLayerAvailability",
                "ecr:BatchGetImage",
                "ecr:GetDownloadUrlForLayer"
            ]
        }
    ]
}"""

OMICS_SERVICE_ACCESS_POLICY_TEMPLATE="""{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "omics workflow access",
      "Effect": "Allow",
      "Principal": {
        "Service": "omics.amazonaws.com"
      },
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ]
    }
  ]
}"""


def generate_root_arn_from_account_id(account_id):
    return "arn:aws:iam::" + account_id + ":root"

def get_unique_ecr_repo_names_from_omics_config(_omics_config_file):
    """
    Parse omics-config file generated by inspect_nf.py
    """
    with open(_omics_config_file) as f:
        omics_config = f.readlines()
    repositories = []
    for line in omics_config:
        if line.startswith('withName'):
            line = line.replace(' ', '').strip()
            if 'container=' in line:
                container = line.split('container=')[1].split(':')[0].replace('\'','').replace('"','')
                repositories.append(container)
    return list(set(repositories))

def main(args):
    logging.basicConfig(level = logging.INFO)
    omics_config_file = args.omics_config
    logging.info(f"omics config file name: {os.path.abspath(omics_config_file)}")
    aws_accounts = args.aws_accounts

    logging.info("Get repository names from nexflow omics config file")
    repositories = get_unique_ecr_repo_names_from_omics_config(omics_config_file)
    logging.info(repositories)

    ##boto3.setup_default_session(profile_name='')
    ecr_client = boto3.client('ecr')
    
    for repo in repositories:
        
        # get omics service permission from template
        omics_permission_policy_statement = json.loads(OMICS_SERVICE_ACCESS_POLICY_TEMPLATE)['Statement'][0]

        # get current repository policy
        logging.info("Get policy for repository " + repo)
        try:
            response = ecr_client.get_repository_policy(
                repositoryName=repo
            )
        except ClientError as e:
            print(e)
            sys.exit(1)
        # load statements to check
        existing_statements = json.loads(response['policyText'])['Statement']

        new_statements = []
        # add aws accounts as principals
        policy_document = json.loads(X_ACCOUNT_POLICY_TEMPLATE)
        logging.info("Add principals to policy")
        for account in aws_accounts:
            policy_document['Statement'][0]['Principal']['AWS'].append(generate_root_arn_from_account_id(account))
        new_statements.append(policy_document['Statement'][0])
        # (re)add omics permission
        logging.info("Add omics permission to policy")
        new_statements.append(omics_permission_policy_statement)

        logging.info("Add existing statements back to policy")
        for _statement in existing_statements:
            # check if omics permission is already in policy
            # and add non omics policies back
            if 'Service' in _statement['Principal']:
                if _statement['Principal']['Service'] == 'omics.amazonaws.com':
                    pass
                else:
                    new_statements.append(_statement)
            # check if x-account permission is already in policy
            # for current accounts
            else:
                new_statements.append(_statement)

        final_statements = []
        for _statement in new_statements:
            if _statement not in final_statements:
                final_statements.append(_statement)
                
        # update policy
        logging.info("Update policy for repository " + repo)
        try:
            response = ecr_client.set_repository_policy(
                repositoryName=repo,
                policyText=json.dumps({'Version': '2008-10-17', 'Statement': final_statements})
            )
        except ClientError as e:
            print(e)
            sys.exit(1)
        logging.info(response)
    logging.info("Done with all repositories")


if __name__ == '__main__':
    
    parser = argparse.ArgumentParser(description='Apply cross account permission to all respositories in an omics config generated from inspect_nf.py')
    parser.add_argument('aws_accounts', metavar='A', type=str, nargs='+',
                        help='AWS Account ID to add as principal')
    parser.add_argument('--omics_config', type=str, required=True,
                        help='sum the integers (default: find the max)')
    args = parser.parse_args()

    main(args)