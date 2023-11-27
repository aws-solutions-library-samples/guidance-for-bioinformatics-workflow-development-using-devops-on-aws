import { URL } from 'node:url';

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as iam from 'aws-cdk-lib/aws-iam';

function uriToS3Arn(uri: string) : string {
    const url = new URL(uri);
    return "arn:aws:s3:::" + url.hostname + url.pathname;
}

export interface OmicsWorkflowRoleProps {
    description?: string,
    sourceS3Uris: string[],
    outputS3Arn: string,
}

export class OmicsWorkflowRole extends iam.Role {
    constructor(scope: Construct, id: string, props: OmicsWorkflowRoleProps) {

        // parse bucket name and prefixes
        const sourceS3Arns = props.sourceS3Uris.map(uriToS3Arn);

        super(scope, id, {
            assumedBy: new iam.ServicePrincipal('omics.amazonaws.com'),
            description: props.description,
            inlinePolicies: {
                "s3-access": new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            actions: [
                                "s3:GetObject"
                            ],
                            resources: sourceS3Arns
                        }),
                        new iam.PolicyStatement({
                            actions: [
                                "s3:ListBucket"
                            ],
                            resources: sourceS3Arns
                        }),
                        new iam.PolicyStatement({
                            actions: [
                                "s3:PutObject"
                            ],
                            resources: [props.outputS3Arn]
                        }),
                    ]
                }),
                "default-access": new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            actions: [
                                "logs:DescribeLogStreams",
                                "logs:CreateLogStream",
                                "logs:PutLogEvents"
                            ],
                            resources: [
                                cdk.Arn.format({
                                    service: "logs",
                                    resource: "log-group:/aws/omics/WorkflowLog:log-stream:*"
                                }, cdk.Stack.of(scope))
                            ]
                        }),
                        new iam.PolicyStatement({
                            actions: [
                                "logs:CreateLogGroup"
                            ],
                            resources: [
                                cdk.Arn.format({
                                    service: "logs",
                                    resource: "log-group:/aws/omics/WorkflowLog:*"
                                }, cdk.Stack.of(scope))
                            ]
                        }),
                        new iam.PolicyStatement({
                            actions: [
                                "ecr:BatchGetImage",
                                "ecr:GetDownloadUrlForLayer",
                                "ecr:BatchCheckLayerAvailability"
                            ],
                            resources: [
                                cdk.Arn.format({
                                    service: "ecr",
                                    resource: "repository",
                                    resourceName: "*"
                                }, cdk.Stack.of(scope))
                            ]
                        })
                    ]
                })
            }
        })
    }
}