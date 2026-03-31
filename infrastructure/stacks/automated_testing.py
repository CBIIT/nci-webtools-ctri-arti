from typing import Optional, Sequence
from constructs import Construct
from aws_cdk import (
    Stack,
    Tags,
    Duration,
    RemovalPolicy,
    aws_dynamodb,
    aws_kms,
    aws_s3,
    aws_iam,
)

from common.retention_base import (
    DATA_CLASSIFICATION_TYPES,
    MOVE_TO_DEEP_ARCHIVE_AFTER,
    MOVE_TO_GLACIER_INSTANT_RETRIEVAL_AFTER,
    S3_LIFECYCLE_RULES,
    NUM_OF_NONCURRENT_VERSIONS_TO_RETAIN,  ### count;  Do NOT retain any OLDER versions of objects, beyond these many versions.
    RETAIN_NONCURRENT_VERSIONS_FOR,  ### days; Do NOT retain any OLDER versions of objects, beyond these many versions.
    DataClassification,
)

from common.StandardBucket import create_std_bucket, gen_bucket_name, gen_bucket_lifecycle, S3_LIFECYCLE_RULES
from common.standard_ddbtbl import standard_dynamodb_table
from stacks.standard_standalone_codebuild_project import CodeBuildProjects, CdkCodeBuildStackProps

from config import Config

### ----------------------

class CodeBuildStack(Stack):
    def __init__(self, scope: Construct, id_: str,
        tier :str,
        aws_env :str,
        config : Config,
        **kwargs,
    ) -> None:
        super().__init__(scope=scope, id=id_, stack_name=id_, **kwargs)

        CodeBuildProjects( self, 'test-automation-codebuild-project',
            props = CdkCodeBuildStackProps(
                tier=tier,
                aws_env=aws_env,
                vpc_name=config["automated_testing"]["vpc_name"],
                security_group=config["automated_testing"]["security_group"],
                subnets=config["automated_testing"]["subnets"],
            ),
        )


### ----------------------

class BucketsStack(Stack):
    def __init__(self, scope: Construct, id_: str,
        tier :str,
        aws_env :str,
        **kwargs,
    ) -> None:
        super().__init__(scope=scope, id=id_, stack_name=id_, **kwargs)

        ### Automated-Testing generates stuff that has NO retention needs.
        data_classification_type: DATA_CLASSIFICATION_TYPES = DATA_CLASSIFICATION_TYPES.CLOUD_TEMPORARY
        all_lifecycle_rules: dict[str, Sequence[aws_s3.LifecycleRule]] = gen_bucket_lifecycle(
            tier=tier,
            data_classification_type=data_classification_type, enabled=True
        )

        bucket_name = gen_bucket_name( tier=None, ### <--- common bucket to ALL tiers in one aws-account.
                                      simple_bucket_name="test-data",
                                      component_name="Research-Optimizer",
                                      ).lower()
        self.etl_data_sets_bucket: aws_s3.Bucket = create_std_bucket(
            scope = self,
            id = 'test-automation-s3-bucket',
            bucket_name = bucket_name,
            tier = tier,
            data_classification_type = data_classification_type,
            enable_S3PreSignedURLs = True,
            lifecycle_rules=all_lifecycle_rules[S3_LIFECYCLE_RULES.LOW_COST.name],
            # cors_rule_list=[cors_rule],
        )

        # ### Allow CodeBuild service read-write access to the bucket
        # self.etl_data_sets_bucket.add_to_resource_policy(
        #     aws_iam.PolicyStatement(
        #         sid="AllowCodeBuildReadWriteAccess",
        #         effect=aws_iam.Effect.ALLOW,
        #         principals=[aws_iam.ServicePrincipal("codebuild.amazonaws.com")],  # type: ignore
        #         actions=[
        #             "s3:GetObject*",
        #             "s3:PutObject*",
        #             "s3:DeleteObject*",
        #             "s3:ListBucket",
        #             "s3:ListBucketVersions",
        #             "s3:GetBucketLocation",
        #             "s3:AbortMultipartUpload",
        #             "s3:ListMultipartUploadParts",
        #         ],
        #         resources=[
        #             self.etl_data_sets_bucket.bucket_arn,
        #             f"{self.etl_data_sets_bucket.bucket_arn}/*"
        #         ],
        #     )
        # )

### ----------------------

class DynamoDBTableStack(Stack):
    def __init__(self, scope: Construct, id_: str,
        tier :str,
        aws_env :str,
        **kwargs,
    ) -> None:
        super().__init__(scope=scope, id=id_, stack_name=id_, **kwargs)
        stk = Stack.of(self)

        ### Automated-Testing generates stuff that has NO retention needs.
        data_classification_type: DATA_CLASSIFICATION_TYPES = DATA_CLASSIFICATION_TYPES.CLOUD_TEMPORARY

        self.process_status_table = standard_dynamodb_table(
            scope=self,
            id='test-automation-logs',
            tier = tier,
            ddbtbl_name = f"ResearchOptimizer-test-suites",
            # ddbtbl_name = f"{tier}-test-suites",
            # ddbtbl_name = f"{stk.stack_name}-test-automation-logs",
            # ddbtbl_name=aws_names.gen_dynamo_table_name(tier, 'fact_process_status'),
            partition_key=aws_dynamodb.Attribute(name="execution_id", type=aws_dynamodb.AttributeType.STRING),
            sort_key=aws_dynamodb.Attribute(name="step", type=aws_dynamodb.AttributeType.STRING),
            # global_secondary_indexes=aws_dynamodb.GlobalSecondaryIndexPropsV2(
            #     index_name="gsi",
            #     partition_key = aws_dynamodb.Attribute(name="aws_request_id", type=aws_dynamodb.AttributeType.STRING),
            #     sort_key=aws_dynamodb.Attribute(
            #                     name="step",
            #                     type=aws_dynamodb.AttributeType.STRING
            #     ),
            # )
            # local_secondary_indexes=[aws_dynamodb.LocalSecondaryIndexProps(
            #     index_name="lsi",
            #     sort_key=aws_dynamodb.Attribute(name="aws_request_id", type=aws_dynamodb.AttributeType.STRING))
            # ],
        )

        # ### Allow CodeBuild service read-write access to the DynamoDB table
        # self.process_status_table.grant(
        #     aws_iam.ServicePrincipal("codebuild.amazonaws.com"),
        #     "dynamodb:PutItem",
        #     "dynamodb:GetItem",
        #     "dynamodb:UpdateItem",
        #     "dynamodb:DeleteItem",
        #     "dynamodb:Query",
        #     "dynamodb:Scan",
        #     "dynamodb:BatchWriteItem",
        #     "dynamodb:BatchGetItem",
        #     "dynamodb:DescribeTable",
        #     "dynamodb:DescribeTimeToLive",
        #     "dynamodb:UpdateTimeToLive",
        #     "dynamodb:PartiQLSelect",
        #     "dynamodb:PartiQLInsert",
        #     "dynamodb:PartiQLUpdate",
        #     "dynamodb:PartiQLDelete",
        # )

### EoF
