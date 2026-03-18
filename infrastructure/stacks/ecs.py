from typing import List, Optional
from aws_cdk import (
    Stack,
    aws_ec2 as ec2,
    aws_ecr as ecr,
    aws_ecs as ecs,
    aws_iam as iam,
    aws_logs as logs,
    aws_elasticloadbalancingv2 as elbv2,
    aws_secretsmanager as secretsmanager,
    aws_servicediscovery as servicediscovery,
    aws_ssm as ssm,
)
from constructs import Construct

from config import ServiceDefinition


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
        priority: int,
        services: List[ServiceDefinition],
        secrets: dict,
        **kwargs,
    ) -> None:
        super().__init__(scope, id, **kwargs)

        self._prefix = prefix

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

        http_namespace = servicediscovery.HttpNamespace(
            self,
            "ecs-http-namespace",
            name=f"{prefix}-http",
            description=prefix,
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

        listener = elbv2.ApplicationListener.from_lookup(
            self,
            "ecs-service-listener",
            load_balancer_tags={"Name": tier},
            listener_protocol=elbv2.ApplicationProtocol.HTTPS,
        )

        shared_secrets = self._build_secrets(secrets)

        for svc in services:
            name = svc["name"]
            port = svc["port"]

            task_def = ecs.FargateTaskDefinition(
                self,
                f"task-def-{name}",
                execution_role=execution_role,
                task_role=task_role,
                family=f"{id}-{name}",
                cpu=svc.get("cpu", 1024),
                memory_limit_mib=svc.get("memoryLimitMiB", 2048),
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
                    for vol in svc.get("volumes", [])
                ],
            )

            container = task_def.add_container(
                f"container-{name}",
                image=self._container_image(name, svc["image"]),
                container_name=name,
                port_mappings=[
                    ecs.PortMapping(
                        name=name,
                        container_port=port,
                    )
                ],
                environment=svc.get("environment", {}),
                secrets=shared_secrets,
                logging=ecs.AwsLogDriver(
                    log_group=log_group,
                    stream_prefix=name,
                ),
            )

            if "mountPoints" in svc:
                for mp in svc["mountPoints"]:
                    container.add_mount_points(
                        ecs.MountPoint(
                            source_volume=mp["sourceVolume"],
                            container_path=mp["containerPath"],
                            read_only=mp["readOnly"],
                        )
                    )

            fargate_service = ecs.FargateService(
                self,
                f"service-{name}",
                cluster=cluster,
                desired_count=svc.get("desiredCount", 1),
                task_definition=task_def,
                service_name=f"{prefix}-{name}",
                propagate_tags=ecs.PropagatedTagSource.TASK_DEFINITION,
                enable_ecs_managed_tags=True,
                enable_execute_command=True,
                min_healthy_percent=100,
                service_connect_configuration=ecs.ServiceConnectProps(
                    namespace=http_namespace.namespace_arn,
                    services=[
                        ecs.ServiceConnectService(
                            port_mapping_name=name,
                            dns_name=name,
                            port=port,
                        )
                    ],
                ),
            )

            if svc.get("exposedViaAlb"):
                target_group = elbv2.ApplicationTargetGroup(
                    self,
                    "ecs-service-target-group",
                    vpc=vpc_lookup,
                    port=port,
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

                fargate_service.attach_to_application_target_group(target_group)

            scaling = fargate_service.auto_scale_task_count(
                min_capacity=svc.get("minCapacity", 1),
                max_capacity=svc.get("maxCapacity", 4),
            )

            target_pct = svc.get("targetCapacityPercent", 70)

            scaling.scale_on_cpu_utilization(
                f"cpu-scaling-{name}",
                target_utilization_percent=target_pct,
            )

            scaling.scale_on_memory_utilization(
                f"memory-scaling-{name}",
                target_utilization_percent=target_pct,
            )

    def _build_secrets(self, secrets_config):
        """Build shared ECS secrets from config. Called once, reused across all services."""
        secrets = {}
        for param_key, string_value in secrets_config.items():
            parameter_label = param_key.lower().replace("_", "-")

            if isinstance(string_value, list):
                secret_name, field = string_value
                secret = secretsmanager.Secret.from_secret_name_v2(
                    self,
                    f"secret-{parameter_label}",
                    secret_name,
                )
                secrets[param_key] = ecs.Secret.from_secrets_manager(secret, field)
            elif string_value:
                parameter_name = f"/{self._prefix}/{parameter_label}"
                ssm_param = ssm.StringParameter(
                    self,
                    f"secret-{parameter_label}",
                    parameter_name=parameter_name,
                    string_value=string_value,
                )
                secrets[param_key] = ecs.Secret.from_ssm_parameter(ssm_param)
        return secrets

    def _container_image(self, name, uri):
        """Use from_ecr_repository for ECR URIs, from_registry otherwise."""
        host, _, repo_tag = uri.partition("/")
        if ".dkr.ecr." in host:
            repo_name, _, tag = repo_tag.partition(":")
            repo = ecr.Repository.from_repository_name(self, f"ecr-repo-{name}", repo_name)
            return ecs.ContainerImage.from_ecr_repository(repo, tag=tag or "latest")
        return ecs.ContainerImage.from_registry(uri)
