import { Stack, StackProps, Duration, aws_rds as rds, aws_ec2 as ec2 } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface RdsClusterStackProps extends StackProps {
  vpc: string;
  subnets: string[];
  clusterIdentifier: string;
  databaseName: string;
  minCapacity?: number;
  maxCapacity?: number;
  secondsUntilAutoPause?: number;
  backupRetentionPeriod?: number;
}

export const defaultProps = {
  databaseName: "postgres",
  minCapacity: 0,
  maxCapacity: 1,
  secondsUntilAutoPause: 300,
  backupRetentionPeriod: 7,
};

export class RdsClusterStack extends Stack {
  constructor(scope: Construct, id: string, props: RdsClusterStackProps) {
    super(scope, id, props);
    const stackProps = { ...defaultProps, ...props };
    const cluster = new rds.DatabaseCluster(this, "rds-cluster", {
      vpc: ec2.Vpc.fromLookup(this, "rds-cluster-vpc", { vpcName: stackProps.vpc }),
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      credentials: rds.Credentials.fromGeneratedSecret("admin"),
      clusterIdentifier: stackProps.clusterIdentifier,
      writer: rds.ClusterInstance.serverlessV2("writer", {
        instanceIdentifier: stackProps.clusterIdentifier,
      }),
      defaultDatabaseName: stackProps.databaseName,
      enableDataApi: true,
      serverlessV2MaxCapacity: stackProps.maxCapacity,
      serverlessV2MinCapacity: stackProps.minCapacity,
      backup: {
        retention: Duration.days(stackProps.backupRetentionPeriod),
      },
    });
  }
}
