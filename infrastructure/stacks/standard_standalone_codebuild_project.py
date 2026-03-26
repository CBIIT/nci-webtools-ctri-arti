"""
CDK Stack for creating standalone CodeBuild projects for automated testing.

This module creates CodeBuild projects with:
- Standard build environments
- IAM permissions for CDK deployments, ECR, CodeArtifact, etc.
- CloudWatch logging
- Environment variable configuration from .env files
"""

import os
import re
from enum import Enum
from typing import Dict, Optional, List
from pathlib import Path
import yaml

from constructs import Construct
from aws_cdk import (
    Stack,
    StackProps,
    RemovalPolicy,
    Duration,
    aws_iam,
    aws_ec2,
    aws_logs,
    aws_codebuild,
)

### ======================================================================================================

# CDK_APP_NAME constant - matches project structure
CDK_APP_NAME = "nci-CTRI-ARTI-webtools"

BUILDSPEC_FILE_PATH = "buildspec.yaml"
BUILDSPEC_MAX_INLINE_SIZE = 25600  # CodeBuild inline buildspec limit in bytes

class CodeBuildProjects(Enum):
    """Enum for different CodeBuild project types."""
    AUTOMATED_TESTING = "auto-testing"
    # GATEWAY = "gateway"
    # CMS = "cms"
    # CLIENT = "client"

### ===================================

class CdkCodeBuildStackProps:
    """Properties for CdkCodeBuildStack."""

    def __init__(
        self,
        tier: str,
        aws_env: str,
        vpc_id: str,
        subnets: list[str],
        dmz_subnets: Optional[list[str]] = None,
        webapp_subnets: Optional[list[str]] = None,
        db_subnets: Optional[list[str]] = None,
        security_group: Optional[str] = None,
    ):
        self.tier = tier
        self.aws_env = aws_env
        self.vpc_id = vpc_id
        self.subnets = subnets
        ### optional properties
        self.dmz_subnets = dmz_subnets
        self.webapp_subnets = webapp_subnets
        self.db_subnets = db_subnets
        self.security_group = security_group

### ======================================================================================================


def get_codebuild_env_vars(
    stk: Stack,
    props: CdkCodeBuildStackProps,
    vpc: aws_ec2.IVpc,
    which_codebuild_project: CodeBuildProjects,
) -> Dict[str, aws_codebuild.BuildEnvironmentVariable]:
    """
    Get environment variables for CodeBuild project.

    Args:
        stk: CDK Stack instance
        props: Stack properties
        vpc: VPC for the CodeBuild project
        which_codebuild_project: Type of CodeBuild project

    Returns:
        Dictionary of environment variables for CodeBuild
    """

    git_repo_name = f"{CDK_APP_NAME}-{which_codebuild_project.value}"
    ecr_repository = f"{git_repo_name}-repo"

    ### Since CloudOne aws-acct has -NO- concept of public-subnet !!
    # public_subnets = ",".join([
    #     subnet.subnet_id
    #     for subnet in vpc.public_subnets   ### Public !
    #     if subnet.availability_zone in vpc.availability_zones
    # ])

    ### Since CloudOne aws-acct has 3 types of "egress" subnets.. we have to explicitly specify them!
    # private_subnets = ",".join([
    #     subnet.subnet_id
    #     for subnet in vpc.private_subnets   ### Private !!
    #     if subnet.availability_zone in vpc.availability_zones
    # ])

    # Load overriding entries from .env file
    overrides = load_env_vars_from_file(stk, which_codebuild_project)

    # Build environment variables based on project type
    if which_codebuild_project == CodeBuildProjects.AUTOMATED_TESTING:
        env_vars = {
            "TIER": aws_codebuild.BuildEnvironmentVariable(value=props.tier),
            "AWS_ENV": aws_codebuild.BuildEnvironmentVariable(value=props.aws_env),
            "GIT_BRANCH": aws_codebuild.BuildEnvironmentVariable( value=overrides.get("GIT_BRANCH", "main") ),
            "FrontendStkName": aws_codebuild.BuildEnvironmentVariable(
                value=overrides.get("FrontendStkName", f"{CDK_APP_NAME}-{props.tier}-frontend")
            ),
            "AppUrl": aws_codebuild.BuildEnvironmentVariable(
                value=overrides.get("AppUrl", overrides.get("DOMAIN_NAME", "https://example.com"))
            ),

            "AWS_ACCOUNT_ID": aws_codebuild.BuildEnvironmentVariable(value=stk.account),
            "AWS_REGION": aws_codebuild.BuildEnvironmentVariable(value=stk.region),
            "VPC_ID": aws_codebuild.BuildEnvironmentVariable(value=props.vpc_id),
            "AVAILABILITY_ZONES": aws_codebuild.BuildEnvironmentVariable( value=",".join(vpc.availability_zones) ),
            "SECURITY_GROUP": aws_codebuild.BuildEnvironmentVariable(value=props.security_group),
            "SUBNETS": aws_codebuild.BuildEnvironmentVariable(value=",".join(props.subnets)),
            "DMZ_SUBNETS": aws_codebuild.BuildEnvironmentVariable(value=",".join(props.dmz_subnets) if props.dmz_subnets else ",".join(props.subnets)),
            "WEBAPP_SUBNETS": aws_codebuild.BuildEnvironmentVariable(value=",".join(props.webapp_subnets) if props.webapp_subnets else ",".join(props.subnets)),
            "DB_SUBNETS": aws_codebuild.BuildEnvironmentVariable(value=",".join(props.db_subnets) if props.db_subnets else ",".join(props.subnets)),
        }

        # Add Secrets Manager ARNs as plain env vars - these ARNs are used in buildspec's secrets-manager section
        # This way the actual secret values are only accessible via secrets-manager syntax, not as regular env vars
        if "AUTO_TESTING_USER_ID_SECRET_ARN" in overrides:
            env_vars["AUTO_TESTING_USER_ID_SECRET_ARN"] = aws_codebuild.BuildEnvironmentVariable(
                value=overrides["AUTO_TESTING_USER_ID_SECRET_ARN"]
            )

        if "AUTO_TESTING_USER_PASSWORD_SECRET_ARN" in overrides:
            env_vars["AUTO_TESTING_USER_PASSWORD_SECRET_ARN"] = aws_codebuild.BuildEnvironmentVariable(
                value=overrides["AUTO_TESTING_USER_PASSWORD_SECRET_ARN"]
            )

        return env_vars

    return {}



### ======================================================================================================


class CdkCodeBuildStack(Stack):
    """
    CDK Stack for creating CodeBuild projects.

    Want to add Env-Vars to it? Use a `.env` file at top of project.
    In that `.env` file you can use `${this.<property>}` to reference CDK properties like account, region, etc.

    In addition to what is in `.env`, the CodeBuild-project will automatically have the following ENV-VARS:
    - AWS_ACCOUNT_ID
    - AWS_REGION
    - APP_ENV
    - VPC_ID
    - AVAILABILITY_ZONES
    - SECURITY_GROUP
    - PUBLIC_SUBNETS
    - PRIVATE_SUBNETS
    - ECR_REPOSITORY
    """

    def __init__(
        self,
        scope: Construct,
        id: str,
        props: CdkCodeBuildStackProps,
        **kvargs,
    ) -> None:
        super().__init__(scope, id, **kvargs)

        vpc = aws_ec2.Vpc.from_lookup(self, "Vpc", vpc_id=props.vpc_id)

        # Create one CodeBuild project for each project type
        for buildspec_type in CodeBuildProjects:
            buildspec_filepath = f"config/{props.tier}-{buildspec_type.value}-{BUILDSPEC_FILE_PATH}"
            self._create_single_codebuild(
                buildspec_type,
                vpc,
                buildspec_filepath,
                props,
            )

    ### -------------------------------------------------------------------------

    def _create_single_codebuild(
        self,
        which_codebuild_project: CodeBuildProjects,
        vpc: aws_ec2.IVpc,
        buildspec_filepath: str,
        props: CdkCodeBuildStackProps,
    ) -> None:
        """Create a single CodeBuild project with standard permissions."""

        git_repo_name = f"{CDK_APP_NAME}-{which_codebuild_project.value}"
        project_name = f"{git_repo_name}-{props.tier}-build"

        ### Get CodeBuild's buildspec from a file.
        full_path = Path(__file__).parent.parent / buildspec_filepath # Path relative to infrastructure directory
        if full_path.exists():
            stats = full_path.stat()
            if stats.st_size <= BUILDSPEC_MAX_INLINE_SIZE:
                with open(full_path, "r") as f:
                    content = yaml.safe_load(f)
                build_spec = aws_codebuild.BuildSpec.from_object(content)
            else:
                build_spec = aws_codebuild.BuildSpec.from_asset(buildspec_filepath)
        else:
            raise FileNotFoundError(f"Buildspec file not found: {full_path}")

        ### Create CodeBuild project
        cbproj = aws_codebuild.Project(
            self,
            f"CodeBuildProject={which_codebuild_project.value}",
            project_name=project_name,
            build_spec=build_spec,
            environment=aws_codebuild.BuildEnvironment(
                build_image=aws_codebuild.LinuxBuildImage.STANDARD_7_0,
                environment_variables=get_codebuild_env_vars(
                    self, props, vpc, which_codebuild_project
                ),
            ),
            logging=aws_codebuild.LoggingOptions(
                cloud_watch=aws_codebuild.CloudWatchLoggingOptions(
                    log_group=aws_logs.LogGroup(
                        self,
                        f"CodeBuildLogGroup-{which_codebuild_project.value}",
                        retention=aws_logs.RetentionDays.THREE_MONTHS,
                        removal_policy=RemovalPolicy.DESTROY,
                    ),
                ),
            ),
        )

        ### Add IAM permissions
        self._add_iam_permissions(cbproj)

    ### -------------------------------------------------------------------------

    def _add_iam_permissions(self, cbproj: aws_codebuild.Project) -> None:
        """Add standard IAM permissions to CodeBuild project role."""

        ### Secrets Manager access
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccesstoQdrantSecret",
                actions=["secretsmanager:GetSecretValue"],
                resources=[
                    f"arn:aws:secretsmanager:{self.region}:{self.account}:secret:*",
                ],
            )
        )

        ### CloudFormation permissions
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccessToCloudFormation",
                actions=["cloudformation:*"],
                resources=["*"],
            )
        )

        ### SSM and CloudFormation
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="TODOAllowSSMActions",
                actions=["ssm:*", "cloudformation:*"],
                resources=["*"],
            )
        )

        ### S3 permissions for CDK assets
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccessToCDKAssetsBucket",
                actions=["s3:*"],
                resources=[
                    f"arn:aws:s3:::cdk-*-assets-{self.account}-{self.region}",
                    f"arn:aws:s3:::cdk-*-assets-{self.account}-{self.region}/*",
                ],
            )
        )

        ### Permissions to assume CDK bootstrap roles
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccessToCDKStandardRoles",
                actions=["sts:AssumeRole"],
                resources=[
                    f"arn:aws:iam::{self.account}:role/cdk-*-deploy-role-{self.account}-{self.region}",
                    f"arn:aws:iam::{self.account}:role/cdk-*-file-publishing-role-{self.account}-{self.region}",
                    f"arn:aws:iam::{self.account}:role/cdk-*-image-publishing-role-{self.account}-{self.region}",
                ],
            )
        )

        ### CodeArtifact bearer token
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccessToCodeArtifactBearerToken",
                actions=["sts:GetServiceBearerToken"],
                resources=["*"],
                conditions={
                    "StringEquals": {"sts:AWSServiceName": "codeartifact.amazonaws.com"}
                },
            )
        )

        ### CodeArtifact authorization token
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccessToCodeArtifactToken",
                actions=["codeartifact:GetAuthorizationToken"],
                resources=["*"],
            )
        )

        ### CodeArtifact access
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccessToCodeArtifact",
                actions=[
                    "codeartifact:List*",
                    "codeartifact:Describe*",
                    "codeartifact:Get*",
                    "codeartifact:Read*",
                    "sts:GetServiceBearerToken",
                ],
                resources=[
                    f"arn:aws:codeartifact:{self.region}:{self.account}:domain/veridix",
                    f"arn:aws:codeartifact:{self.region}:{self.account}:repository/veridix/*",
                ],
            )
        )

        ### ECR token access
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccessToECRToken",
                actions=[
                    "ecr:GetAuthorizationToken",
                    "ecr:DescribeRepositories",
                    "ecr:CreateRepository",
                    "ecr:SetRepositoryPolicy",
                    "ecr:TagResource",
                ],
                resources=["*"],
            )
        )

        ### ECR repository images
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccessToECRepoImages",
                actions=[
                    "ecr:GetAuthorizationToken",
                    "ecr:DescribeRepositories",
                    "ecr:CreateRepository",
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchGetImage",
                    "ecr:DescribeImages",
                    "ecr:PutImage",
                    "ecr:InitiateLayerUpload",
                    "ecr:UploadLayerPart",
                    "ecr:CompleteLayerUpload",
                ],
                resources=[
                    f"arn:aws:ecr:{self.region}:{self.account}:repository/*",
                ],
            )
        )

        ### Route53 DNS access
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccessToDNS",
                actions=["route53:Get*", "route53:List*"],
                resources=["*"],
            )
        )

        ### CloudFront access
        cbproj.add_to_role_policy(
            aws_iam.PolicyStatement(
                sid="AccessToCloudFront",
                actions=[
                    "cloudfront:Get*",
                    "cloudfront:List*",
                    # "cloudfront:Create*",
                    # "cloudfront:Update*",
                    # "cloudfront:Delete*",
                    # "cloudfront:Tag*",
                ],
                resources=["*"],
            )
        )


### ======================================================================================================


def load_env_vars_from_file(
    stk: Stack,
    which_codebuild_project: CodeBuildProjects,
) -> Dict[str, str]:
    """
    UTILITY Function !!
    To help test this CDK-code locally on GFE.  Simulates env-vars specified in GH-Actions.

    Loads environment variables from `.env***` files.
    NOTE: Each CodeBuild-project will need have its --OWN--  `./.env-<project-type>` file !!

    Some values can be sensitive information, can override the hardcoded/placeholder CodeBuild env variables.

    Args:
        stk: CDK Stack instance
        which_codebuild_project: Type of CodeBuild project

    Returns:
        Dictionary of environment variable overrides
    """
    env_path = Path(__file__).parent.parent / f".env-{which_codebuild_project.value}"
    env_vars: Dict[str, str] = {}

    if not env_path.exists():
        return env_vars

    with open(env_path, "r") as f:
        env_content = f.read()

    for line in env_content.split("\n"):
        trimmed = line.strip()
        if trimmed and not trimmed.startswith("#"):
            parts = trimmed.split("=", 1)
            if len(parts) == 2:
                key = parts[0].strip()
                value = parts[1].strip().strip('"').strip("'")

                # Replace CDK property references
                value = re.sub(r'\$\{stk\.partition\}', stk.partition, value)
                value = re.sub(r'\$\{stk\.region\}', stk.region, value)
                value = re.sub(r'\$\{stk\.account\}', stk.account, value)
                value = re.sub(r'\$\{this\.partition\}', stk.partition, value)
                value = re.sub(r'\$\{this\.region\}', stk.region, value)
                value = re.sub(r'\$\{this\.account\}', stk.account, value)

                env_vars[key] = value

    return env_vars


### ======================================================================================================
### EoF
