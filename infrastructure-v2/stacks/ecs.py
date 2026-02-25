from typing import List, Optional, Union
from aws_cdk import (
    Stack,
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_iam as iam,
    aws_logs as logs,
    aws_elasticloadbalancingv2 as elbv2,
    aws_secretsmanager as secretsmanager,
    aws_ssm as ssm,
)
from constructs import Construct

from config import ContainerDefinition, TaskDefinition


class EcsServiceStack(Stack):
    def __init__(
        self,
        scope: Construct,
        id: str,
        *,
        prefix: str,
        tier: str,
        vpc: str,
        subnets: List[str],
        domain_name: str,
        alt_domain_name: Optional[str] = None,
        desired_count: int,
        priority: int,
        task_definition: TaskDefinition,
        min_capacity: int,
        max_capacity: int,
        target_capacity_percent: int,
        **kwargs,
    ) -> None:
        super().__init__(scope, id, **kwargs)

        vpc_lookup = ec2.Vpc.from_lookup(self, "ecs-service-vpc", vpc_name=vpc)

        cluster = ecs.Cluster(
            self,
            "ecs-cluster",
            vpc=vpc_lookup,
            cluster_name=prefix,
            enable_fargate_capacity_providers=True,
            execute_command_configuration=ecs.ExecuteCommandConfiguration(
                logging=ecs.ExecuteCommandLogging.NONE,
            ),
        )

        execution_role = iam.Role(
            self,
            "ecs-task-execution-role",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            role_name=f"power-user-{prefix}-task-execution-role"[:64],
        )

        execution_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name(
                "service-role/AmazonECSTaskExecutionRolePolicy"
            )
        )
        execution_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name(
                "AmazonElasticFileSystemClientFullAccess"
            )
        )

        task_role = iam.Role(
            self,
            "ecs-task-role",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            role_name=f"power-user-{prefix}-task-role"[:64],
        )

        task_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AWSMarketplaceManageSubscriptions")
        )
        task_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AmazonElasticFileSystemClientFullAccess")
        )
        task_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AmazonBedrockFullAccess")
        )
        task_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AmazonPollyReadOnlyAccess")
        )
        task_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AmazonRDSDataFullAccess")
        )
        task_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("SecretsManagerReadWrite")
        )
        task_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("TranslateFullAccess")
        )
        task_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AmazonS3FullAccess")
        )

        log_group = logs.LogGroup(
            self,
            "log-group",
            log_group_name=prefix,
            retention=logs.RetentionDays.ONE_MONTH,
        )

        fargate_task_definition = ecs.FargateTaskDefinition(
            self,
            "ecs-task-definition",
            execution_role=execution_role,
            task_role=task_role,
            family=id,
            memory_limit_mib=task_definition.get("memoryLimitMiB", 2048),
            cpu=task_definition.get("cpu", 1024),
            volumes=[
                ecs.Volume(
                    name=vol["name"],
                    efs_volume_configuration=ecs.EfsVolumeConfiguration(
                        file_system_id=vol["efsVolumeConfiguration"]["fileSystemId"],
                        root_directory=vol["efsVolumeConfiguration"].get("rootDirectory"),
                        transit_encryption="ENABLED"
                        if vol["efsVolumeConfiguration"].get("transitEncryption") == "ENABLED"
                        else "DISABLED",
                        authorization_config=ecs.AuthorizationConfig(
                            access_point_id=vol["efsVolumeConfiguration"]["authorizationConfig"][
                                "accessPointId"
                            ],
                            iam="ENABLED"
                            if vol["efsVolumeConfiguration"]["authorizationConfig"].get("iam")
                            == "ENABLED"
                            else "DISABLED",
                        ),
                    ),
                )
                for vol in task_definition.get("volumes", [])
            ],
        )

        containers: List[ContainerDefinition] = task_definition.get("containers", [])
        for i, container_props in enumerate(containers):
            secrets: dict[str, ecs.Secret] = {}

            if "secrets" in container_props:
                for param_key, string_value in container_props["secrets"].items():
                    parameter_label = param_key.lower().replace("_", "-")

                    if isinstance(string_value, list):
                        secret_name, field = string_value
                        secret = secretsmanager.Secret.from_secret_name_v2(
                            self,
                            f"secret-{container_props['name']}-{parameter_label}",
                            secret_name,
                        )
                        secrets[param_key] = ecs.Secret.from_secrets_manager(secret, field)
                    elif string_value:
                        parameter_name = f"/{prefix}/{container_props['name']}/{parameter_label}"
                        ssm_param = ssm.StringParameter(
                            self,
                            f"secret-{container_props['name']}-{parameter_label}",
                            parameter_name=parameter_name,
                            string_value=string_value,
                        )
                        secrets[param_key] = ecs.Secret.from_ssm_parameter(ssm_param)

            container = fargate_task_definition.add_container(
                f"container-{i}",
                image=ecs.ContainerImage.from_registry(container_props["image"]),
                container_name=container_props["name"],
                port_mappings=[
                    ecs.PortMapping(
                        name=pm["name"],
                        container_port=pm["containerPort"],
                    )
                    for pm in container_props.get("portMappings", [])
                ],
                environment=container_props.get("environment", {}),
                secrets=secrets,
                logging=ecs.AwsLogDriver(
                    log_group=log_group,
                    stream_prefix=container_props["name"],
                ),
            )

            if "mountPoints" in container_props:
                for mp in container_props["mountPoints"]:
                    container.add_mount_points(
                        ecs.MountPoint(
                            source_volume=mp["sourceVolume"],
                            container_path=mp["containerPath"],
                            read_only=mp["readOnly"],
                        )
                    )

        port_mapping = None
        if containers and containers[0].get("portMappings"):
            port_mapping = containers[0]["portMappings"][0]

        service = ecs.FargateService(
            self,
            "ecs-service",
            cluster=cluster,
            desired_count=desired_count,
            task_definition=fargate_task_definition,
            service_name=prefix,
            propagate_tags=ecs.PropagatedTagSource.TASK_DEFINITION,
            enable_ecs_managed_tags=True,
            enable_execute_command=True,
            min_healthy_percent=100,
        )

        listener = elbv2.ApplicationListener.from_lookup(
            self,
            "ecs-service-listener",
            load_balancer_tags={"Name": tier},
            listener_protocol=elbv2.ApplicationProtocol.HTTPS,
        )

        target_group = elbv2.ApplicationTargetGroup(
            self,
            "ecs-service-target-group",
            vpc=vpc_lookup,
            port=port_mapping["containerPort"] if port_mapping else 80,
            protocol=elbv2.ApplicationProtocol.HTTP,
            target_type=elbv2.TargetType.IP,
            target_group_name=prefix,
        )

        listener.add_target_groups(
            "ecs-service-listener-targets",
            target_groups=[target_group],
            priority=priority,
            conditions=[
                elbv2.ListenerCondition.host_headers([domain_name]),
            ],
        )

        if alt_domain_name:
            listener.add_action(
                "ecs-service-listener-redirect",
                action=elbv2.ListenerAction.redirect(
                    host=domain_name,
                    port="443",
                    protocol="HTTPS",
                    permanent=True,
                    path="/#{path}",
                    query="#{query}",
                ),
                priority=priority + 1,
                conditions=[elbv2.ListenerCondition.host_headers([alt_domain_name])],
            )

        service.attach_to_application_target_group(target_group)

        scaling = service.auto_scale_task_count(
            min_capacity=min_capacity,
            max_capacity=max_capacity,
        )

        scaling.scale_on_cpu_utilization(
            "cpu-scaling",
            target_utilization_percent=target_capacity_percent,
        )

        scaling.scale_on_memory_utilization(
            "memory-scaling",
            target_utilization_percent=target_capacity_percent,
        )
