"""
This file has the following for public use across the project.
*   2 enums "DATA_CLASSIFICATION_TYPES" and "S3_LIFECYCLE_RULES"
*   A class "DataClassification" and it's STATIC methods "retention_for()" "removal_policy()" and "versioning()"; The 4th method "default_retention()" should only be used EARLY in the development, and should be replaced with "retention_for()".
*   A function "create_std_bucket()" -- which should be used in place of -ALL- instances of "aws_s3.Bucket(..)";
*   A function "gen_bucket_props()" -- which should be used when Buckets are AUTO-created by level-2 and level-3 CDK-constructs (example: aws_cloudfront.BucketDeployment, etc..)
"""

from typing import Mapping, Optional, Sequence
from constructs import Construct
from aws_cdk import (
    Stack,
    Tags,
    Duration,
    RemovalPolicy,
    aws_s3,
    aws_kms,
    aws_iam,
)

from config import KMSKeyAliasName_S3

### ======================================================================================================

from common.retention_base import (
    DATA_CLASSIFICATION_TYPES,
    MOVE_TO_DEEP_ARCHIVE_AFTER,
    MOVE_TO_GLACIER_INSTANT_RETRIEVAL_AFTER,
    S3_LIFECYCLE_RULES,
    NUM_OF_NONCURRENT_VERSIONS_TO_RETAIN,  ### count;  Do NOT retain any OLDER versions of objects, beyond these many versions.
    RETAIN_NONCURRENT_VERSIONS_FOR,  ### days; Do NOT retain any OLDER versions of objects, beyond these many versions.
    DataClassification,
)


def _int_to_duration(i: int) -> Optional[Duration]:
    if i <= 0:
        return None
    else:
        return Duration.days(i)


### ----------------------------------------------------------------
""" Standardized naming for BUCKETS """
def gen_bucket_name( tier :Optional[str], simple_bucket_name :str, component_name :Optional[str] = None ) -> str:
    if component_name:
        if tier:
            return f"NCI-CTRI-{component_name}-{tier}-{simple_bucket_name}".lower()
        else:
            return f"NCI-CTRI-{component_name}-{simple_bucket_name}".lower()
    else:
        if tier:
            return f"NCI-CTRI-{tier}-{simple_bucket_name}".lower()
        else:
            return f"NCI-CTRI-{simple_bucket_name}".lower()

### ======================================================================================================
### ******************************************************************************************************
### ======================================================================================================

""" look inside ~/.cdk.json for an element named "s3_access_logging_bucket", and detect whether the branch/tier has s3_access_logging bucket specified.
    If yes, per security-policy, all buckets should be logged.
"""

s3_accessLogsBkt_lookup :dict[str,aws_s3.IBucket] = {}


def lookup_access_logs_bucket(scope: Construct, id :str, tier: str) -> Optional[aws_s3.IBucket]:

    s3logging_config :dict = scope.node.try_get_context("s3_access_logging_bucket")

    if s3logging_config and tier in s3logging_config:
        server_access_logs_bucket_name = s3logging_config[tier]
    else:
        server_access_logs_bucket_name = None
    print( f"server_access_logs_bucket_name='{server_access_logs_bucket_name}'" )

    if server_access_logs_bucket_name:
        if server_access_logs_bucket_name in s3_accessLogsBkt_lookup:
            server_access_logs_bucket = s3_accessLogsBkt_lookup[ server_access_logs_bucket_name ]
        else:
            server_access_logs_bucket = aws_s3.Bucket.from_bucket_name(
                scope=scope, id="s3-access-logs-"+id,
                bucket_name=server_access_logs_bucket_name
            )
            s3_accessLogsBkt_lookup[ server_access_logs_bucket_name ] = server_access_logs_bucket
    else:
        server_access_logs_bucket = None

    print( f"server_access_logs_bucket='{server_access_logs_bucket}'" )
    return server_access_logs_bucket


### ======================================================================================================
""" internal use only, within this file.
    Returns a list of variables.
"""


def __calculate_s3_props(
    tier: str,
    data_classification_type: DATA_CLASSIFICATION_TYPES,
    versioned: bool,
    removal_policy: Optional[RemovalPolicy],
):
    versionedX = (
        versioned if versioned else DataClassification.versioning(tier=tier, data_type=data_classification_type)
    )
    print(f"versionedX='{versionedX}' inside create_std_bucket() within " + __file__)

    removal_policyX: RemovalPolicy = DataClassification.removal_policy(tier=tier, data_type=data_classification_type)
    print(f"removal_policyX='{removal_policyX}' inside create_std_bucket() within " + __file__)

    removal_policyX = removal_policy if removal_policy else removal_policyX
    print(f"removal_policyX='{removal_policyX}' #2 inside create_std_bucket() within " + __file__)

    auto_delete_objectsX = (removal_policyX == RemovalPolicy.DESTROY) and (not versionedX)
    print(f"auto_delete_objectsX='{auto_delete_objectsX}' inside create_std_bucket() within " + __file__)

    return versionedX, removal_policyX, auto_delete_objectsX


### ======================================================================================================

""" Create a Bucket per Project standards - as appropriate for the `data_classification_type`
"""


def create_std_bucket(
    scope: Construct,
    id: str,
    tier: str,
    data_classification_type: DATA_CLASSIFICATION_TYPES,
    lifecycle_rules: Sequence[aws_s3.LifecycleRule],
    versioned: bool = False,
    removal_policy: Optional[RemovalPolicy] = None,
    encryption: Optional[aws_s3.BucketEncryption] = None,
    cors_rule_list: Optional[list] = None,
    bucket_name: Optional[str] = None,
    enable_S3PreSignedURLs :bool = False,
    # block_public_access :aws_s3.BlockPublicAccess,
    **kwargs,
) -> aws_s3.Bucket:
    HDR = " create_std_bucket() within " + __file__
    stk = Stack.of(scope)

    print(f"tier='{tier}' :" + HDR )
    server_access_logs_bucket = lookup_access_logs_bucket(scope=scope, id=id, tier=tier)
    versioned2, removal_policy2, auto_delete_objects2 = __calculate_s3_props(
        tier, data_classification_type, versioned, removal_policy
    )

    all_lifecycle_rules = gen_bucket_lifecycle(
        tier=tier, data_classification_type=data_classification_type, keep_older_versions=versioned2
    )

    block_public_access = aws_s3.BlockPublicAccess.BLOCK_ALL
    # if enable_S3PreSignedURLs:
    #     ### This allows bucket-policies while still blocking ACLs
    #     block_public_access = aws_s3.BlockPublicAccess(
    #         block_public_acls=True,
    #         block_public_policy=False,      ### Allow Bucket-specific policies
    #         ignore_public_acls=True,
    #         restrict_public_buckets=False,   ### Allow bucket policies to work
    #     )
    # else:
    #     block_public_access = aws_s3.BlockPublicAccess.BLOCK_ALL

    if cors_rule_list is None:
        cors_rule_list = [] ### To ensure .append() invocation below never has an exception thrown.
    cors_rule_list.append( aws_s3.CorsRule(
        allowed_methods=[ aws_s3.HttpMethods.GET, aws_s3.HttpMethods.PUT ],
        allowed_origins=['*'],
        allowed_headers=['*'],
        max_age=24*3600 ### seconds
    ))

    encryption_key_arn = f"arn:aws:kms:{stk.region}:{stk.account}:alias/{KMSKeyAliasName_S3}"
    print( f"encryption_key_arn='{encryption_key_arn}'" )
    construct_id = 'kmslkp-'+ (bucket_name if bucket_name else "NoBucketName")
    encryption_key = aws_kms.Key.from_key_arn(scope, construct_id, encryption_key_arn) if encryption_key_arn else None
    print( f"encryption_key='{encryption_key}'" )
    # encryption_key = aws_kms.Key.from_key_arn( scope, 'kmslkp-'+bucket_name, f"arn:aws:kms:{stk.region}:{stk.account}:alias/aws/s3"),
    if not encryption_key: raise Exception( f"encryption_key is None, when creating a STANDARDIZED-S3-bucket")

    newbkt = aws_s3.Bucket(
        scope = scope,
        id = id,
        bucket_name = bucket_name,
        auto_delete_objects = auto_delete_objects2,
        versioned = versioned2,
        removal_policy = removal_policy2,
        block_public_access = block_public_access,
        object_ownership = aws_s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
        # object_ownership = aws_s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
        # access_control = aws_s3.BucketAccessControl.PRIVATE, ### deprecated. ### <-- ATTENTION !! Must NOT be set for CF's logging bucket
                ### Fix CloudFormation STACK-ERROR -> Bucket cannot have ACLs set with ObjectOwnership's BucketOwnerEnforced setting
                ### Fix cfn-lint ERROR -> E3045 A bucket with AccessControl set should also have OwnershipControl configured
        encryption = encryption if encryption else aws_s3.BucketEncryption.KMS,
        encryption_key = encryption_key,
        enforce_ssl = True,
        cors = cors_rule_list,
        server_access_logs_bucket = server_access_logs_bucket,
        lifecycle_rules=(
            lifecycle_rules if lifecycle_rules else all_lifecycle_rules[S3_LIFECYCLE_RULES.INTELLIGENT_TIERING.name]
        ),
        **kwargs,
    )
    if bucket_name:
        Tags.of(newbkt).add(key="ResourceName", value = bucket_name)

    # Add bucket policy to enforce SSL/TLS (S3_BUCKET_SSL_REQUESTS_ONLY)
    newbkt.add_to_resource_policy(
        aws_iam.PolicyStatement(
            effect=aws_iam.Effect.DENY,
            principals=[aws_iam.StarPrincipal()],  # type: ignore
            actions=["s3:*"],
            resources=[
                newbkt.bucket_arn,
                f"{newbkt.bucket_arn}/*"
            ],
            conditions={
                "Bool": {
                    "aws:SecureTransport": "false"
                }
            }
        )
    )

    return newbkt


### ======================================================================================================


def gen_s3_bucket_props(
    scope: Construct,
    tier: str,
    data_classification_type: DATA_CLASSIFICATION_TYPES,
    lifecycle_rules: list[aws_s3.LifecycleRule],
    versioned: bool = False,
    removal_policy: Optional[RemovalPolicy] = None,
    encryption: Optional[aws_s3.BucketEncryption] = None,
    cors_rule_list: Optional[list] = None,
    bucket_name: Optional[str] = None,
    enable_S3PreSignedURLs :bool = False,
) -> aws_s3.BucketProps:
    """per Security Guidelines, all buckets should IDEALLY have the following properties set."""

    HDR = " gen_s3_nucket_props() within " + __file__
    stk = Stack.of(scope)

    print(f"tier='{tier}' :" + HDR )
    server_access_logs_bucket = lookup_access_logs_bucket(scope=scope, id="cdkjsonLkpS3AccessLogsbkt", tier=tier)
    versioned2, removal_policy2, auto_delete_objects2 = __calculate_s3_props(
        tier, data_classification_type, versioned, removal_policy
    )

    all_lifecycle_rules = gen_bucket_lifecycle(
        tier=tier, data_classification_type=data_classification_type, keep_older_versions=versioned2
    )

    block_public_access = aws_s3.BlockPublicAccess.BLOCK_ALL
    # if enable_S3PreSignedURLs:
    #     ### This allows bucket-policies while still blocking ACLs
    #     block_public_access = aws_s3.BlockPublicAccess(
    #         block_public_acls=True,
    #         block_public_policy=False,      ### Allow Bucket-specific policies
    #         ignore_public_acls=True,
    #         restrict_public_buckets=False   ### Allow bucket policies to work
    #     )
    # else:
    #     block_public_access = aws_s3.BlockPublicAccess.BLOCK_ALL

    if cors_rule_list is None:
        cors_rule_list = [] ### To ensure .append() invocation below never has an exception thrown.
    cors_rule_list.append( aws_s3.CorsRule(
        allowed_methods=[ aws_s3.HttpMethods.GET, aws_s3.HttpMethods.PUT ],
        allowed_origins=['*'],
        allowed_headers=['*'],
        max_age=24*3600 ### seconds
    ))

    encryption_key_arn = f"arn:aws:kms:{stk.region}:{stk.account}:alias/{KMSKeyAliasName_S3}"
    construct_id = 'kmslkp-'+ (bucket_name if bucket_name else "NoBucketName")
    encryption_key = aws_kms.Key.from_key_arn(scope, construct_id, encryption_key_arn) if encryption_key_arn else None
    # encryption_key = aws_kms.Key.from_key_arn( scope, construct_id, f"arn:aws:kms:{stk.region}:{stk.account}:alias/aws/s3"),

    s3_bucket_props = aws_s3.BucketProps(
        auto_delete_objects = auto_delete_objects2,
        versioned = versioned2,
        removal_policy = removal_policy2,
        block_public_access = block_public_access,
        object_ownership = aws_s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
        # object_ownership = aws_s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
        # access_control = aws_s3.BucketAccessControl.PRIVATE, ### deprecated. ### <-- ATTENTION !! Must NOT be set for CF's logging bucket
                ### Fix CloudFormation STACK-ERROR -> Bucket cannot have ACLs set with ObjectOwnership's BucketOwnerEnforced setting
                ### Fix cfn-lint ERROR -> E3045 A bucket with AccessControl set should also have OwnershipControl configured
        encryption = encryption if encryption else aws_s3.BucketEncryption.KMS,
        encryption_key = encryption_key,
        enforce_ssl = True,
        cors = cors_rule_list,
        server_access_logs_bucket = server_access_logs_bucket,
        lifecycle_rules = (
            lifecycle_rules if lifecycle_rules else all_lifecycle_rules[S3_LIFECYCLE_RULES.INTELLIGENT_TIERING.name]
        ),
    )
    print(s3_bucket_props)
    # print( json.dumps( obj=s3_bucket_props, indent=4, sort_keys=False, ) )

    return s3_bucket_props


### ======================================================================================================

""" Set Intelligent-Tiering as well as handle older-versions/non-current-versions of all objects.
    keep_older_versions :bool (default: False) <--- Whether to QUICKLY-delete the OLDER versions of ANY S3-object -- or not.
    enabled :bool (default: True) <--- Whether to mark the genereated lifecycle-rule as "Enabled" (which is an S3-lifecycle built-in feature).
"""
def gen_bucket_lifecycle(
    tier: str,
    data_classification_type: DATA_CLASSIFICATION_TYPES,
    keep_older_versions: bool = False,  ### Whether to QUICKLY-delete the OLDER versions of ANY S3-object -- or not.
    enabled: bool = True,
    prefixes_for_s3_tiers: Optional[dict] = None,
) -> dict[str, Sequence[aws_s3.LifecycleRule]]:

    expire_timer = _int_to_duration(DataClassification.retention_for(tier=tier, data_type=data_classification_type))

    ### To make rest of code simpler, -ENSURE- each v in each KV-pair (prefixes_for_s3_tiers) is a List-of-Strings.
    if prefixes_for_s3_tiers:
        for key in prefixes_for_s3_tiers:
            print(f"prefixes_for_s3_tiers[{key}]='{prefixes_for_s3_tiers[key]}'")
            rhs=prefixes_for_s3_tiers[key]
            if isinstance(rhs, str):
                prefixes_for_s3_tiers[key]=[rhs] ### Convert scalar-strings into a list of strings.

    ### -----------------------------------------------------------------------------
    prefix=""
    common_rule = aws_s3.LifecycleRule(
        id=f"{tier}'s DO-NOT-USE base/commont S3-lifecycle-Rule.  Do --NOT-- use this.  Override this",
        enabled=enabled,
        abort_incomplete_multipart_upload_after = Duration.days(1),
        noncurrent_versions_to_retain = NUM_OF_NONCURRENT_VERSIONS_TO_RETAIN if keep_older_versions else None,
        ### must be a +ve integer. Do NOT retain too many OLDER versions of objects.
        noncurrent_version_expiration = Duration.days( RETAIN_NONCURRENT_VERSIONS_FOR ),
        expired_object_delete_marker = True,
        ### Resolution error: ExpiredObjectDeleteMarker cannot be specified with expiration, ExpirationDate, or TagFilters..
        ### Any other OLDER version of objects expire in 3 days.
        prefix=prefix,
        # tag_filters={ "tier": tier }, <---- AbortIncompleteMultipartUpload cannot be specified with TagsFilter.
        # noncurrent_version_transitions= Do Not transition to lower-tiers on S3
        # expiration=Duration.days( DataClassification.retention_for( tier=tier, data_type=data_classification_type)),
    )

    ### -------------------------------------------------------------------------
    ### for TEMPORARY USE buckets
    if prefixes_for_s3_tiers and S3_LIFECYCLE_RULES.STD_EXPIRY in prefixes_for_s3_tiers:
        prefixes=prefixes_for_s3_tiers[S3_LIFECYCLE_RULES.STD_EXPIRY]
    else:
        prefixes=[common_rule.prefix]
    std_cloud_expiry_rule = []
    for prefix in prefixes:
        newrule = aws_s3.LifecycleRule(
            enabled=common_rule.enabled,
            abort_incomplete_multipart_upload_after=common_rule.abort_incomplete_multipart_upload_after,
            noncurrent_versions_to_retain=common_rule.noncurrent_versions_to_retain,
            noncurrent_version_expiration=common_rule.noncurrent_version_expiration,
            prefix=prefix,
            # expired_object_delete_marker=True, ### Resolution error: ExpiredObjectDeleteMarker cannot be specified with expiration, ExpirationDate, or TagFilters..
            # tag_filters={ "tier": tier }, <---- AbortIncompleteMultipartUpload cannot be specified with TagsFilter.
            id=f"{tier}'s EXPIRE-OBJECTS in 90-days s3-lifecycle-rule - default for all CLOUD-Objects that are NOT app-related",
            expiration=Duration.days(
                DataClassification.retention_for(tier=tier, data_type=DATA_CLASSIFICATION_TYPES.CLOUD_TEMPORARY)
            ),
            # transitions = None !!!!
        )
        std_cloud_expiry_rule.append(newrule)

    ### -------------------------------------------------------------------
    ### Intelligent-TIERING LifeCycle Rule
    intel_tiering_transition_timer :int = DataClassification.glacierinstant_transition_after(
        tier=tier, data_type=DATA_CLASSIFICATION_TYPES.CLOUD_TEMPORARY
    )

    transitions = [
        aws_s3.Transition(
            storage_class=aws_s3.StorageClass.INTELLIGENT_TIERING,
            transition_after=Duration.days(intel_tiering_transition_timer - 1),
        )
    ]

    if prefixes_for_s3_tiers and S3_LIFECYCLE_RULES.INTELLIGENT_TIERING in prefixes_for_s3_tiers:
        prefixes=prefixes_for_s3_tiers[S3_LIFECYCLE_RULES.INTELLIGENT_TIERING]
    else:
        prefixes=[common_rule.prefix]
    ### ---------
    ### AWS Rule: "'Days' in the Expiration action for filter '(prefix=/)' must be greater than 'Days' in the Transition action
    intelligent_tiering_rule = []
    for prefix in prefixes:
        newrule = aws_s3.LifecycleRule(
            enabled=common_rule.enabled,
            abort_incomplete_multipart_upload_after=common_rule.abort_incomplete_multipart_upload_after,
            noncurrent_versions_to_retain=common_rule.noncurrent_versions_to_retain,
            noncurrent_version_expiration=common_rule.noncurrent_version_expiration,
            transitions=transitions,
            # expired_object_delete_marker=True, ### Resolution error: ExpiredObjectDeleteMarker cannot be specified with expiration, ExpirationDate, or TagFilters..
            # tag_filters={ "tier": tier }, <---- AbortIncompleteMultipartUpload cannot be specified with TagsFilter.
            prefix = prefix,
            id=f"{tier}'s 'INTELLIGENT-Tiering - default for --ALL-- buckets",
            expiration=expire_timer,
        )
        intelligent_tiering_rule.append(newrule)

    ### -------------------------------------------------------------------
    if prefixes_for_s3_tiers and S3_LIFECYCLE_RULES.SCRATCH in prefixes_for_s3_tiers:
        prefixes=prefixes_for_s3_tiers[S3_LIFECYCLE_RULES.SCRATCH]
    else:
        prefixes=[common_rule.prefix]
    ### Athena Workgroup's Query-Results objects must expire after 1 day
    athena_queryres_tiering_rule = []
    for prefix in prefixes:
        newrule = aws_s3.LifecycleRule(
            enabled=common_rule.enabled,
            abort_incomplete_multipart_upload_after=common_rule.abort_incomplete_multipart_upload_after,
            noncurrent_versions_to_retain = None,   ### !!! Different from all other LifeCycle-rules.
            noncurrent_version_expiration = Duration.days(1), ### !!! Different from all other LifeCycle-rules.
            transitions=None,
            # expired_object_delete_marker=True, ### Resolution error: ExpiredObjectDeleteMarker cannot be specified with expiration, ExpirationDate, or TagFilters..
            # tag_filters={ "tier": tier }, <---- AbortIncompleteMultipartUpload cannot be specified with TagsFilter.
            prefix = prefix,
            id=f"{tier}'s s3-lifecycle-rule for Bucket - to delete S3-objects after just 1-day",
            expiration=expire_timer,
        )
        athena_queryres_tiering_rule.append(newrule)

    ### -----------------------------------------------------------------------
    ### AWS Rule: "'Days' in the Expiration action for filter '(prefix=/)' must be greater than 'Days' in the Transition action
    glac_inst_transition_timer = _int_to_duration(
        DataClassification.glacierinstant_transition_after(tier=tier, data_type=data_classification_type)
    )

    transitions = [
        aws_s3.Transition(
            storage_class=aws_s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
            transition_after=glac_inst_transition_timer,
        )
    ]

    if prefixes_for_s3_tiers and S3_LIFECYCLE_RULES.LOW_COST in prefixes_for_s3_tiers:
        prefixes=prefixes_for_s3_tiers[S3_LIFECYCLE_RULES.LOW_COST]
    else:
        prefixes=[common_rule.prefix]
    ### ---------
    instantretrieval_rule = []
    for prefix in prefixes:
        newrule = aws_s3.LifecycleRule(
            enabled=common_rule.enabled,
            abort_incomplete_multipart_upload_after=common_rule.abort_incomplete_multipart_upload_after,
            noncurrent_versions_to_retain=common_rule.noncurrent_versions_to_retain,
            noncurrent_version_expiration=common_rule.noncurrent_version_expiration,
            transitions=transitions,
            # expired_object_delete_marker=True, ### Resolution error: ExpiredObjectDeleteMarker cannot be specified with expiration, ExpirationDate, or TagFilters..
            # tag_filters={ "tier": tier }, <---- AbortIncompleteMultipartUpload cannot be specified with TagsFilter.
            prefix = prefix,
            id=f"{tier}'s GLACIER_INSTANT_RETRIEVAL s3-lifecycle-rule - default for all buckets",
            expiration=expire_timer,
        )
        instantretrieval_rule.append(newrule)

    ### ------------------------------------------------------------------
    ### Glacier DEEP-ARCHIVE LifeCycle rule
    coldsto_transition_timer = _int_to_duration(
        DataClassification.deeparchive_transition_after(tier=tier, data_type=data_classification_type)
    )
    min_coldsto_transition_timer = _int_to_duration(
        int(min(MOVE_TO_DEEP_ARCHIVE_AFTER, coldsto_transition_timer.to_days()))
        if coldsto_transition_timer
        else MOVE_TO_DEEP_ARCHIVE_AFTER
    )

    transitions = []
    transitions.append(
        aws_s3.Transition(
            storage_class=aws_s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
            transition_after=glac_inst_transition_timer,
        )
    )
    transitions.append(
        aws_s3.Transition(
            storage_class=aws_s3.StorageClass.DEEP_ARCHIVE,
            transition_after=min_coldsto_transition_timer,
        )
    )

    if prefixes_for_s3_tiers and S3_LIFECYCLE_RULES.COLD_STORAGE in prefixes_for_s3_tiers:
        prefixes=prefixes_for_s3_tiers[S3_LIFECYCLE_RULES.COLD_STORAGE]
    else:
        prefixes=[common_rule.prefix]
    ### ---------
    ### AWS Rule: "'Days' in the Expiration action for filter '(prefix=/)' must be greater than 'Days' in the Transition action
    deeparchive_rule = []
    for prefix in prefixes:
        newrule = aws_s3.LifecycleRule(
            enabled=common_rule.enabled,
            abort_incomplete_multipart_upload_after=common_rule.abort_incomplete_multipart_upload_after,
            noncurrent_versions_to_retain=common_rule.noncurrent_versions_to_retain,
            noncurrent_version_expiration=common_rule.noncurrent_version_expiration,
            transitions=transitions,
            # expired_object_delete_marker=True, ### Resolution error: ExpiredObjectDeleteMarker cannot be specified with expiration, ExpirationDate, or TagFilters..
            # tag_filters={ "tier": tier }, <---- AbortIncompleteMultipartUpload cannot be specified with TagsFilter.
            prefix = prefix,
            id=f"{tier}'s 'DEEP-ARCHIVE s3-lifecycle-rule - default for all buckets",
            expiration=expire_timer,
        )
        deeparchive_rule.append(newrule)

    ### -----------------------------------------------------------------------
    return {
        S3_LIFECYCLE_RULES.COMMON.name: common_rule, # type: ignore
        S3_LIFECYCLE_RULES.STD_EXPIRY.name: std_cloud_expiry_rule,
        S3_LIFECYCLE_RULES.INTELLIGENT_TIERING.name: intelligent_tiering_rule,
        S3_LIFECYCLE_RULES.LOW_COST.name: instantretrieval_rule,
        S3_LIFECYCLE_RULES.COLD_STORAGE.name: deeparchive_rule,
        S3_LIFECYCLE_RULES.SCRATCH.name: athena_queryres_tiering_rule,
    }


### ======================================================================================================


def add_lifecycle_rules_to_bucket(
    bucket: aws_s3.Bucket,
    rules: list[aws_s3.LifecycleRule],
) -> aws_s3.Bucket:
    for rule in rules:
        add_lifecycle_rule_to_bucket(bucket=bucket, rule=rule)
    return bucket


### ======================================================================================================


def add_lifecycle_rule_to_bucket(
    bucket: aws_s3.Bucket,
    rule: aws_s3.LifecycleRule,
) -> aws_s3.Bucket:
    """Add a single lifecycle-rule to a bucket."""
    if not bucket or not rule:
        return bucket

    bucket.add_lifecycle_rule(
        enabled=rule.enabled,
        abort_incomplete_multipart_upload_after=rule.abort_incomplete_multipart_upload_after,
        expiration=rule.expiration,
        expiration_date=rule.expiration_date,
        expired_object_delete_marker=rule.expired_object_delete_marker,
        noncurrent_version_expiration=rule.noncurrent_version_expiration,
        noncurrent_versions_to_retain=rule.noncurrent_versions_to_retain,
        noncurrent_version_transitions=(
            list(rule.noncurrent_version_transitions) if rule.noncurrent_version_transitions else None
        ),  ### shallow clone
        object_size_greater_than=rule.object_size_greater_than,
        object_size_less_than=rule.object_size_less_than,
        tag_filters=rule.tag_filters if rule.tag_filters else None,  ### shallow clone
        transitions=rule.transitions.copy() if rule.transitions else None,  ### shallow clone
        id = rule.id,
        prefix = rule.prefix,
    )
    return bucket


### ======================================================================================================


### EoF
