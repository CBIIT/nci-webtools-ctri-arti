import { EcrRepositoryStackProps } from '../lib/stacks/ecr-repository-stack';
import { EcsServiceStackProps } from '../lib/stacks/ecs-service-stack';
// import { EfsFilesystemStackProps } from '../lib/stacks/efs-filesystem-stack';
import { RdsInstanceStackProps } from '../lib/stacks/rds-instance-stack';
import { Route53HostedZoneStackProps } from '../lib/stacks/route53-hosted-zone-stack';

export interface Config {
  env: {
    account: string;
    region: string;
  },
  // route53: Route53HostedZoneStackProps,
  ecr: EcrRepositoryStackProps;
  ecs: EcsServiceStackProps;
  // efs: EfsFilesystemStackProps;
  // rds: RdsInstanceStackProps;
  tags: Record<string, string>;
}