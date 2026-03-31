from enum import Enum, unique
from typing import Optional

from constructs import Construct
from aws_cdk import (
    Stack,
    Tags,
    RemovalPolicy,
    Names,
    aws_logs,
    aws_kms,
    aws_iam,
)

### ====================================================================================================================

""" The standardized log-groups should have "std-prefixes" based on the AWS-Service """
@unique
class LogGroupType(Enum):
    Misc = "", ### No prefix to NAME of Log-Group

    Lambda = "/aws/lambda",
    APIGW  = "/aws/apigateway",
    CodeBuild = "/aws/codebuild",
    StepFunction = "/aws/states",
    WafAcl = "/aws/waf-acl",
    # CloudFront = "CloudFront",
    # S3 = "S3",
    # DynamoDB = "DynamoDB",
    # Kinesis = "Kinesis",


### ===============================================================================================

""" Standardizing the LogGroup class (std vs. infreq-access) by tier.
    Save money.
"""
def get_loggrp_class(
    construct :Optional[Construct],
    tier :str,
    aws_env :Optional[str] = None
) -> aws_logs.LogGroupClass:
    # logs.LogGroupClass.INFREQUENT_ACCESS Will --DENY-- features like Live Tail, metric extraction / Lambda insights, alarming,
    # !! WARNING !! it will also --DENY-- Subscription filters / Export to S3 (that Standard log-class provides)
    if tier != "dev":
        return aws_logs.LogGroupClass.STANDARD ### for CRRI-Cloud; TODO for CloudOne
        # return aws_logs.LogGroupClass.INFREQUENT_ACCESS <--- This will PREVENT DataDog subscriptions to the LogStreams !!!!!!!!!!
    else:
        return aws_logs.LogGroupClass.STANDARD ### for `dev` and `int`

### ====================================================================================================================

""" Generic utility to create Log-Groups for --ANYTHING-- (APIGW, Lambdas, CodeBuild, ..)
    Right now all have same retention-periods.

    param # 1: scope :Construct
    param # 2: tier :str - dev|int|test|uat|stage|prod
    param # 3: loggrp_type :LogGroupType - See the enum for details.
    param # 4: what-is-being-logged :str -  EXAMPLE: "APIGW-1-AccessLogs", "${LambdaName}-Lambda", "CodeBuildProj-{}" ..
    param # 5: loggrp_name :str (OPTIONAL) -  name of the log-group to be created;  Best-practice = Never name the log-groups.
"""
def get_log_grp(
    scope :Construct,
    tier  :str,
    loggrp_type :LogGroupType,
    what_is_being_logged :str,
    loggrp_name :Optional[str] = None,
) -> aws_logs.LogGroup:

    stk = Stack.of(scope)
    auto_loggrp_name = loggrp_type.value[0] +'/'+ what_is_being_logged
    encryption_key = None ### TODO -- AWS does -NOT- offer an AWS-Managed KMS key for CloudWatch Logs;  So, have to create a Customer-Managed KMS key!!!
    # encryption_key_arn = f"arn:aws:kms:{stk.region}:{stk.account}:alias/{KMSKeyAliasName_CWLogs}"
    # encryption_key = aws_kms.Key.from_key_arn(scope, 'kmslkp-'+what_is_being_logged, encryption_key_arn) if encryption_key_arn else None
    # encryption_key = aws_kms.Key.from_key_arn( scope, 'kmslkp-'+what_is_being_logged, f"arn:aws:kms:{stk.region}:{stk.account}:alias/?????????")

    loggrp = aws_logs.LogGroup(
        scope = scope,
        id = "logs-"+ what_is_being_logged,
        log_group_name  = loggrp_name,
        # log_group_name  = loggrp_name or auto_loggrp_name,
        retention       = aws_logs.RetentionDays.SEVEN_YEARS if tier == "prod" else aws_logs.RetentionDays.ONE_YEAR,
        removal_policy  = RemovalPolicy.RETAIN if tier != "dev" else RemovalPolicy.DESTROY,
        log_group_class = aws_logs.LogGroupClass.STANDARD,
        # logs.LogGroupClass.INFREQUENT_ACCESS Will --DENY-- features like Live Tail, metric extraction / Lambda insights, alarming,
        # !! WARNING !! it will also --DENY-- Subscription filters / Export to S3 (that Standard log-class provides)
        encryption_key = encryption_key,
    )
    # if encryption_key:
        ### encryption_key.grant_encrypt_decrypt(loggrp) <--- fails to CDK-Synth
        ### Instead, the solution is to grant permissions to the log group's service principal
        ### This is taken care of, ONE-TIME, at account-level, via `FoundationalResourcesStack` in `operations/CDK/OperationsPrerequisites/src/all_stacks.py`

    Tags.of(loggrp).add(key="ResourceName", value =stk.stack_name+"-CWLogs-"+(loggrp_name if loggrp_name else Names.unique_id(scope)))
    return loggrp

### EoF
