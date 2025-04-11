#!/usr/bin/env node
import "source-map-support/register";
import "dotenv/config";
import { App, Tags } from "aws-cdk-lib";
import defaultStackSynthesizer from "./synthesizer";
import config, { prefix } from "../config";
import { EcrRepositoryStack } from "../lib/stacks/ecr-repository-stack";
import { EcsServiceStack } from "../lib/stacks/ecs-service-stack";
import { RdsClusterStack } from "../lib/stacks/rds-cluster-stack";
// import { EfsFilesystemStack } from "../lib/stacks/efs-filesystem-stack";
// import { Route53HostedZoneStack } from "../lib/stacks/route53-hosted-zone-stack";

const app = new App({ defaultStackSynthesizer });
const env = config.env;

// Add tags to all resources
for (const key in config.tags) {
  Tags.of(app).add(key, config.tags[key]);
}

// console.log('config', config);

new EcrRepositoryStack(app, `${prefix}-ecr-repository`, { env, ...config.ecr });
new EcsServiceStack(app, `${prefix}-ecs-service`, { env, ...config.ecs });
new RdsClusterStack(app, `${prefix}-rds-cluster`, { env, ...config.rds });
// new EfsFilesystemStack(app, `${prefix}-efs-filesystem`, { env, ...config.efs });
// new Route53HostedZoneStack(app, `${prefix}-route53-hosted-zone`, { env, ...config.route53 });
