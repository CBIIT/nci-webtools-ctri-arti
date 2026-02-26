#!/usr/bin/env python3
import aws_cdk as cdk

from config import load_config
from synthesizer import create_synthesizer
from stacks import EcrRepositoryStack, EcsServiceStack, RdsClusterStack


def main():
    config, prefix, tier = load_config()
    env = cdk.Environment(
        account=config["env"]["account"],
        region=config["env"]["region"],
    )

    synthesizer = create_synthesizer()
    app = cdk.App(default_stack_synthesizer=synthesizer)

    # Add tags to all resources
    for key, value in config["tags"].items():
        if value:
            cdk.Tags.of(app).add(key, value)

    # ECR Repository Stack
    EcrRepositoryStack(
        app,
        f"{prefix}-ecr-repository",
        env=env,
        repository_name=config["ecr"]["repositoryName"],
    )

    # ECS Service Stack
    ecs_config = config["ecs"]
    EcsServiceStack(
        app,
        f"{prefix}-ecs-service",
        env=env,
        prefix=prefix,
        tier=tier,
        vpc=ecs_config["vpc"],
        subnets=ecs_config["subnets"],
        domain_name=ecs_config["domainName"],
        alt_domain_name=ecs_config.get("altDomainName"),
        desired_count=ecs_config["desiredCount"],
        priority=ecs_config["priority"],
        task_definition=ecs_config["taskDefinition"],
        min_capacity=ecs_config["minCapacity"],
        max_capacity=ecs_config["maxCapacity"],
        target_capacity_percent=ecs_config["targetCapacityPercent"],
    )

    # RDS Cluster Stack
    rds_config = config["rds"]
    RdsClusterStack(
        app,
        f"{prefix}-rds-cluster",
        env=env,
        vpc=rds_config["vpc"],
        subnets=rds_config["subnets"],
        cluster_identifier=rds_config["clusterIdentifier"],
        database_name=rds_config.get("databaseName", "postgres"),
        min_capacity=rds_config.get("minCapacity", 0),
        max_capacity=rds_config.get("maxCapacity", 1),
        seconds_until_auto_pause=rds_config.get("secondsUntilAutoPause", 300),
        backup_retention_period=rds_config.get("backupRetentionPeriod", 7),
    )

    app.synth()


if __name__ == "__main__":
    main()
