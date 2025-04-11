import { EcrRepositoryStackProps } from "../lib/stacks/ecr-repository-stack";
import { EcsServiceStackProps } from "../lib/stacks/ecs-service-stack";
import { EfsFilesystemStackProps } from '../lib/stacks/efs-filesystem-stack';
import { RdsClusterStackProps } from "../lib/stacks/rds-cluster-stack";
import { Route53HostedZoneStackProps } from "../lib/stacks/route53-hosted-zone-stack";

export interface Config {
  env: {
    account: string;
    region: string;
  };
  route53?: Route53HostedZoneStackProps;
  ecr: EcrRepositoryStackProps;
  ecs: EcsServiceStackProps;
  efs?: EfsFilesystemStackProps;
  rds: RdsClusterStackProps;
  tags: Record<string, string>;
}
