import { Config } from "../types";

export const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID  || "";
export const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "";
export const vpc = process.env.VPC || "";
export const subnets = process.env.SUBNETS?.split(",") || [];
export const namespace = process.env.NAMESPACE || "";
export const application = process.env.APPLICATION || "";
export const tier = process.env.TIER || "";
export const prefix = [namespace, application, tier].join("-");

const config: Config = {
  env: {
    account,
    region,
  },
  // rds: {
  //   vpc,
  //   instanceIdentifier: `${prefix}-database`,
  //   instanceType: "t4g.micro",
  //   allocatedStorage: 20,
  // },
  ecr: {
    repositoryName: prefix,
  },
  ecs: {
    vpc,
    subnets,
    // certificate: process.env.CERTIFICATE_ARN || "",
    domainName: process.env.DOMAIN_NAME || "",
    priority: 100,
    // domainZone: process.env.DOMAIN_ZONE || "",
    desiredCount: 1,
    minCapacity: 1,
    maxCapacity: 4,
    targetCapacityPercent: 70,
    taskDefinition: {
      memoryLimitMiB: 4096,
      cpu: 2048,
      containers: [
        {
          image: process.env.SERVER_IMAGE || "httpd" || `${account}.dkr.ecr.${region}.amazonaws.com/${prefix}:server-latest`,
          name: "server",
          portMappings: [
            {
              containerPort: 80,
            }
          ],
          environment: {
            PORT: "80",
            BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || "",
          }
        },
      ],
      volumes: [
        
      ]
    }
  },
  tags: {
    namespace,
    application,
    tier,
  },
};

export default config;