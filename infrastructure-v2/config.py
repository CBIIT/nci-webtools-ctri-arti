import os
from typing import TypedDict, List, Optional
from dotenv import load_dotenv

load_dotenv()


class ContainerPortMapping(TypedDict):
    name: str
    containerPort: int


class ContainerMountPoint(TypedDict):
    sourceVolume: str
    containerPath: str
    readOnly: bool


class ContainerDefinition(TypedDict, total=False):
    image: str
    name: str
    portMappings: List[ContainerPortMapping]
    environment: dict[str, str]
    secrets: dict[str, str | List[str]]
    mountPoints: List[ContainerMountPoint]


class EfsAuthorizationConfig(TypedDict):
    accessPointId: str
    iam: str


class EfsVolumeConfiguration(TypedDict, total=False):
    fileSystemId: str
    rootDirectory: str
    transitEncryption: str
    authorizationConfig: EfsAuthorizationConfig


class VolumeDefinition(TypedDict):
    name: str
    efsVolumeConfiguration: EfsVolumeConfiguration


class TaskDefinition(TypedDict, total=False):
    memoryLimitMiB: int
    cpu: int
    containers: List[ContainerDefinition]
    volumes: List[VolumeDefinition]


class EcsConfig(TypedDict, total=False):
    vpc: str
    subnets: List[str]
    domainName: str
    altDomainName: str
    priority: int
    desiredCount: int
    minCapacity: int
    maxCapacity: int
    targetCapacityPercent: int
    taskDefinition: TaskDefinition


class EcrConfig(TypedDict):
    repositoryName: str


class RdsConfig(TypedDict, total=False):
    vpc: str
    subnets: List[str]
    clusterIdentifier: str
    databaseName: str
    minCapacity: float
    maxCapacity: float
    secondsUntilAutoPause: int
    backupRetentionPeriod: int


class EnvConfig(TypedDict):
    account: str
    region: str


class Config(TypedDict):
    env: EnvConfig
    ecr: EcrConfig
    ecs: EcsConfig
    rds: RdsConfig
    tags: dict[str, str]


def get_env(key: str, default: str = "") -> str:
    """Get environment variable with default."""
    return os.environ.get(key, default)


def get_env_list(key: str, default: Optional[List[str]] = None) -> List[str]:
    """Get environment variable as comma-separated list."""
    value = os.environ.get(key, "")
    if not value:
        return default or []
    return [s.strip() for s in value.split(",")]


def load_config() -> tuple[Config, str, str]:
    """Load configuration from environment variables."""
    account = get_env("CDK_DEFAULT_ACCOUNT") or get_env("AWS_ACCOUNT_ID")
    region = get_env("CDK_DEFAULT_REGION") or get_env("AWS_REGION")
    vpc = get_env("VPC")
    subnets = get_env_list("SUBNETS")
    namespace = get_env("NAMESPACE")
    application = get_env("APPLICATION")
    tier = get_env("TIER")
    prefix = f"{namespace}-{application}-{tier}"

    # Shared secrets used by all services
    shared_secrets = {
        "PGHOST": [prefix, "host"],
        "PGPORT": [prefix, "port"],
        "PGDATABASE": [prefix, "dbname"],
        "PGUSER": [prefix, "username"],
        "PGPASSWORD": [prefix, "password"],
    }

    config: Config = {
        "env": {
            "account": account,
            "region": region,
        },
        "rds": {
            "vpc": vpc,
            "subnets": subnets,
            "clusterIdentifier": f"{prefix}-database",
            "databaseName": "postgres",
            "minCapacity": 0,
            "maxCapacity": 1,
            "secondsUntilAutoPause": 300,
            "backupRetentionPeriod": 7,
        },
        "ecr": {
            "repositoryName": prefix,
        },
        "ecs": {
            "vpc": vpc,
            "subnets": subnets,
            "domainName": get_env("DOMAIN_NAME"),
            "altDomainName": get_env("ALT_DOMAIN_NAME"),
            "priority": 100,
            "desiredCount": 1,
            "minCapacity": 1,
            "maxCapacity": 4,
            "targetCapacityPercent": 70,
            "taskDefinition": {
                "memoryLimitMiB": 4096,
                "cpu": 2048,
                "containers": [
                    # Main app - serves client and proxies to internal services
                    {
                        "image": get_env("MAIN_IMAGE") or get_env("SERVER_IMAGE") or "httpd",
                        "name": "main",
                        "portMappings": [
                            {
                                "name": "main",
                                "containerPort": 80,
                            }
                        ],
                        "environment": {
                            "PORT": "80",
                            "VERSION": get_env("GITHUB_SHA", "latest"),
                            # Internal service URLs (same task = same network namespace = localhost)
                            "GATEWAY_URL": "http://localhost:3001",
                            "CMS_URL": "http://localhost:3002",
                        },
                        "secrets": {
                            "TIER": tier,
                            "SESSION_SECRET": get_env("SESSION_SECRET"),
                            "OAUTH_CLIENT_ID": get_env("OAUTH_CLIENT_ID"),
                            "OAUTH_CLIENT_SECRET": get_env("OAUTH_CLIENT_SECRET"),
                            "OAUTH_CALLBACK_URL": get_env("OAUTH_CALLBACK_URL"),
                            "OAUTH_DISCOVERY_URL": get_env("OAUTH_DISCOVERY_URL"),
                            **shared_secrets,
                            "S3_BUCKETS": get_env("S3_BUCKETS", "rh-eagle"),
                            "EMAIL_ADMIN": get_env("EMAIL_ADMIN"),
                            "EMAIL_DEV": get_env("EMAIL_DEV"),
                            "EMAIL_USER_REPORTS": get_env("EMAIL_USER_REPORTS"),
                            "SMTP_HOST": get_env("SMTP_HOST"),
                            "SMTP_PORT": get_env("SMTP_PORT"),
                            "SMTP_USER": get_env("SMTP_USER"),
                            "SMTP_PASSWORD": get_env("SMTP_PASSWORD"),
                            "BRAVE_SEARCH_API_KEY": get_env("BRAVE_SEARCH_API_KEY"),
                            "DATA_GOV_API_KEY": get_env("DATA_GOV_API_KEY"),
                            "CONGRESS_GOV_API_KEY": get_env("CONGRESS_GOV_API_KEY"),
                        },
                    },
                    # Gateway service - AI inference
                    {
                        "image": get_env("GATEWAY_IMAGE") or "httpd",
                        "name": "gateway",
                        "portMappings": [
                            {
                                "name": "gateway",
                                "containerPort": 3001,
                            }
                        ],
                        "environment": {
                            "PORT": "3001",
                            "DB_SKIP_SYNC": "true",
                        },
                        "secrets": {
                            **shared_secrets,
                            "GEMINI_API_KEY": get_env("GEMINI_API_KEY"),
                        },
                    },
                    # CMS service - conversation management
                    {
                        "image": get_env("CMS_IMAGE") or "httpd",
                        "name": "cms",
                        "portMappings": [
                            {
                                "name": "cms",
                                "containerPort": 3002,
                            }
                        ],
                        "environment": {
                            "PORT": "3002",
                            "DB_SKIP_SYNC": "true",
                        },
                        "secrets": {
                            **shared_secrets,
                        },
                    },
                ],
                "volumes": [],
            },
        },
        "tags": {
            "namespace": namespace,
            "application": application,
            "tier": tier,
        },
    }

    return config, prefix, tier
