import {
  StackProps,
  Stack,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_logs as logs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_ssm as ssm,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { prefix, tier } from "../../config";

export interface EcsServiceStackProps extends StackProps {
  vpc: string;
  subnets: string[];

  domainName: string;

  // default resources
  desiredCount: number;
  priority: number;

  // task definition
  taskDefinition: {
    memoryLimitMiB: number;
    cpu: number;
    containers: {
      image: string;
      name: string;
      portMappings?: {
        containerPort: number;
      }[];
      environment?: Record<string, string>;
      secrets?: Record<string, string>;
      mountPoints?: [
        {
          sourceVolume: string;
          containerPath: string;
          readOnly: boolean;
        }
      ];
    }[];
    volumes?: {
      name: string;
      efsVolumeConfiguration: {
        fileSystemId: string;
        rootDirectory?: string;
        transitEncryption: "ENABLED" | "DISABLED";
        authorizationConfig: {
          accessPointId: string;
          iam: "ENABLED" | "DISABLED";
        };
      };
    }[];
  };

  // autoscaling
  minCapacity: number;
  maxCapacity: number;
  targetCapacityPercent: number;
}

export class EcsServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: EcsServiceStackProps) {
    super(scope, id, props);
    const { desiredCount } = props;

    const vpc = ec2.Vpc.fromLookup(this, "ecs-service-vpc", { vpcName: props.vpc });
    // const subnets = props.subnets.map((subnet) => ec2.Subnet.fromSubnetId(this, `ecs-service-subnet-${subnet}`, subnet));

    const cluster = new ecs.Cluster(this, "ecs-cluster", {
      vpc,
      clusterName: prefix,
      enableFargateCapacityProviders: true,
      executeCommandConfiguration: {
        logging: ecs.ExecuteCommandLogging.NONE,
      },
    });

    const executionRole = new iam.Role(this, "ecs-task-execution-role", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      roleName: `power-user-${prefix}-task-execution-role`.slice(0, 64),
    });

    // grant permissions to the task execution role
    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")
    );
    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonElasticFileSystemClientFullAccess")
    );

    const taskRole = new iam.Role(this, "ecs-task-role", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      roleName: `power-user-${prefix}-task-role`.slice(0, 64),
    });

    taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonElasticFileSystemClientFullAccess")
    );

    taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonBedrockFullAccess")
    )

    taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("TranslateFullAccess")
    )

    const logGroup = new logs.LogGroup(this, "log-group", {
      logGroupName: prefix,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "ecs-task-definition", {
      executionRole,
      taskRole,
      family: id,
      memoryLimitMiB: props.taskDefinition.memoryLimitMiB,
      cpu: props.taskDefinition.cpu,
      volumes: props.taskDefinition.volumes ?? [],
    });
    
    for (let i = 0; i < props.taskDefinition.containers.length; i++) {
      const containerProps = props.taskDefinition.containers[i];

      const secrets: Record<string, ecs.Secret> = {};
      if (containerProps.secrets) {
        for (const paramKey in containerProps.secrets) {
          const parameterLabel = paramKey.toLowerCase().replace(/_/g, "-");
          const parameterName = `/${prefix}/${containerProps.name}/${parameterLabel}`;
          const stringValue = containerProps.secrets[paramKey];
          const param = new ssm.StringParameter(this, `secret-${containerProps.name}-${parameterLabel}`, {
            parameterName,
            stringValue,
          });
          secrets[paramKey] = ecs.Secret.fromSsmParameter(param);
        }
      }

      const container = taskDefinition.addContainer(`container-${i}`, {
        image: ecs.ContainerImage.fromRegistry(containerProps.image),
        containerName: containerProps.name,
        portMappings: containerProps.portMappings ?? [],
        environment: containerProps.environment ?? {},
        secrets: secrets ?? {},
        logging: new ecs.AwsLogDriver({
          logGroup,
          streamPrefix: "ecs",
        })
      });

      // add mount points
      if (containerProps.mountPoints) {
        container.addMountPoints(...containerProps.mountPoints);
      }
    }

    const service = new ecs.FargateService(this, "ecs-service", {
      cluster,
      desiredCount,
      taskDefinition,
      serviceName: prefix,
      propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
      enableECSManagedTags: true,
      enableExecuteCommand: true,
      minHealthyPercent: 100,
    });

    const listener = elbv2.ApplicationListener.fromLookup(this, "ecs-service-listener", {
      loadBalancerTags: { Name: tier },
      listenerProtocol: elbv2.ApplicationProtocol.HTTPS,
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, "ecs-service-target-group", {
      vpc,
      port: props?.taskDefinition?.containers?.[0]?.portMappings?.[0]?.containerPort || 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targetGroupName: prefix,
    });

    listener.addTargetGroups("ecs-service-listener-targets", {
      targetGroups: [targetGroup],
      priority: props.priority,
      conditions: [elbv2.ListenerCondition.hostHeaders([props.domainName])],
    });

    service.attachToApplicationTargetGroup(targetGroup);

    // autoscaling
    const scaling = service.autoScaleTaskCount({
      minCapacity: props.minCapacity,
      maxCapacity: props.maxCapacity,
    });

    scaling.scaleOnCpuUtilization("cpu-scaling", {
      targetUtilizationPercent: props.targetCapacityPercent,
    });

    scaling.scaleOnMemoryUtilization("memory-scaling", {
      targetUtilizationPercent: props.targetCapacityPercent,
    });


  }
}
