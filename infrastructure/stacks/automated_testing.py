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

### EoF
