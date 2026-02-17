from typing import List, Optional
from aws_cdk import (
    Stack,
    Duration,
    aws_rds as rds,
    aws_ec2 as ec2,
)
from constructs import Construct


DEFAULT_DATABASE_NAME = "postgres"
DEFAULT_MIN_CAPACITY = 0
DEFAULT_MAX_CAPACITY = 1
DEFAULT_SECONDS_UNTIL_AUTO_PAUSE = 300
DEFAULT_BACKUP_RETENTION_PERIOD = 7


class RdsClusterStack(Stack):
    def __init__(
        self,
        scope: Construct,
        id: str,
        *,
        vpc: str,
        subnets: List[str],
        cluster_identifier: str,
        database_name: str = DEFAULT_DATABASE_NAME,
        min_capacity: float = DEFAULT_MIN_CAPACITY,
        max_capacity: float = DEFAULT_MAX_CAPACITY,
        seconds_until_auto_pause: int = DEFAULT_SECONDS_UNTIL_AUTO_PAUSE,
        backup_retention_period: int = DEFAULT_BACKUP_RETENTION_PERIOD,
        **kwargs,
    ) -> None:
        super().__init__(scope, id, **kwargs)

        vpc_lookup = ec2.Vpc.from_lookup(self, "rds-cluster-vpc", vpc_name=vpc)

        self.cluster = rds.DatabaseCluster(
            self,
            "rds-cluster",
            vpc=vpc_lookup,
            engine=rds.DatabaseClusterEngine.aurora_postgres(
                version=rds.AuroraPostgresEngineVersion.VER_16_6,
            ),
            credentials=rds.Credentials.from_generated_secret("admin"),
            cluster_identifier=cluster_identifier,
            writer=rds.ClusterInstance.serverless_v2(
                "writer",
                instance_identifier=cluster_identifier,
            ),
            default_database_name=database_name,
            enable_data_api=True,
            serverless_v2_max_capacity=max_capacity,
            serverless_v2_min_capacity=min_capacity,
            backup=rds.BackupProps(
                retention=Duration.days(backup_retention_period),
            ),
        )
