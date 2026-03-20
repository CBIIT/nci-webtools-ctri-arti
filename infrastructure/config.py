import os
from typing import TypedDict, List, Optional
from dotenv import load_dotenv

load_dotenv()


class ContainerMountPoint(TypedDict):
    sourceVolume: str
    containerPath: str
    readOnly: bool


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


class ServiceDefinition(TypedDict, total=False):
    name: str
    image: str
    port: int
    environment: dict[str, str]
    exposedViaAlb: bool
    cpu: int
    memoryLimitMiB: int
    desiredCount: int
    minCapacity: int
    maxCapacity: int
    targetCapacityPercent: int
    volumes: List[VolumeDefinition]
    mountPoints: List[ContainerMountPoint]


class EcsConfig(TypedDict, total=False):
    vpc: str
    subnets: List[str]
    domainName: str
    altDomainName: str
    priority: int
    secrets: dict[str, str | List[str]]
    services: List[ServiceDefinition]


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

    # Secrets shared by all services
    all_secrets = {
        "PGHOST": [prefix, "host"],
        "PGPORT": [prefix, "port"],
        "PGDATABASE": [prefix, "dbname"],
        "PGUSER": [prefix, "username"],
        "PGPASSWORD": [prefix, "password"],
        "SESSION_SECRET": get_env("SESSION_SECRET"),
        "OAUTH_CLIENT_ID": get_env("OAUTH_CLIENT_ID"),
        "OAUTH_CLIENT_SECRET": get_env("OAUTH_CLIENT_SECRET"),
        "OAUTH_CALLBACK_URL": get_env("OAUTH_CALLBACK_URL"),
        "OAUTH_DISCOVERY_URL": get_env("OAUTH_DISCOVERY_URL"),
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
        "GEMINI_API_KEY": get_env("GEMINI_API_KEY"),
        "AZURE_TENANT_ID": get_env("AZURE_TENANT_ID"),
        "AZURE_CLIENT_ID": get_env("AZURE_CLIENT_ID"),
        "AZURE_CLIENT_SECRET": get_env("AZURE_CLIENT_SECRET"),
        "DATABRICKS_HOST": get_env("DATABRICKS_HOST"),
    }

    # Service URLs via Service Connect DNS names
    shared_environment = {
        "GATEWAY_URL": "http://gateway:3001",
        "CMS_URL": "http://cms:3002",
        "AGENTS_URL": "http://agents:3003",
        "USERS_URL": "http://users:3004",
    }

    def build_service(name, port):
        is_main = name == "main"
        image = get_env(f"{name.upper()}_IMAGE")
        if is_main and not image:
            image = get_env("SERVER_IMAGE")
        environment = {
            **shared_environment,
            "PORT": str(port),
            **({"VERSION": get_env("GITHUB_SHA", "latest"), "TIER": tier} if is_main else {"DB_SKIP_SYNC": "true"}),
        }
        return {
            "name": name,
            "image": image or "httpd",
            "port": port,
            "exposedViaAlb": is_main,
            "environment": environment,
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
            "secrets": all_secrets,
            "services": [
                build_service("main", 80),
                build_service("gateway", 3001),
                build_service("cms", 3002),
                build_service("agents", 3003),
                build_service("users", 3004),
            ],
        },
        "tags": {
            "namespace": namespace,
            "application": application,
            "tier": tier,
        },
    }

    return config, prefix, tier

