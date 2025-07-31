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
  rds: {
    vpc,
    subnets,
    clusterIdentifier: `${prefix}-database`,
    databaseName: "postgres",
    minCapacity: 0,
    maxCapacity: 1,
    secondsUntilAutoPause: 300,
    backupRetentionPeriod: 7,
  },
  ecr: {
    repositoryName: prefix,
  },
  ecs: {
    vpc,
    subnets,
    // certificate: process.env.CERTIFICATE_ARN || "",
    domainName: process.env.DOMAIN_NAME || "",
    altDomainName: process.env.ALT_DOMAIN_NAME || "",
    priority: 100,
    // domainZone: process.env.DOMAIN_ZONE || "",
    desiredCount: 1,
    minCapacity: 1,
    maxCapacity: 4,
    targetCapacityPercent: 70,
    taskDefinition: {
      memoryLimitMiB: 2048,
      cpu: 1024,
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
            VERSION: process.env.GITHUB_SHA || "latest",
          },
          secrets: {
            SESSION_SECRET: process.env.SESSION_SECRET || "",
            OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID || "",
            OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET || "",
            OAUTH_CALLBACK_URL: process.env.OAUTH_CALLBACK_URL || "",
            OAUTH_DISCOVERY_URL: process.env.OAUTH_DISCOVERY_URL || "",

            PGHOST: [prefix, "host"],
            PGPORT: [prefix, "port"],
            PGDATABASE: [prefix, "dbname"],
            PGUSER: [prefix, "username"],
            PGPASSWORD: [prefix, "password"],

            EMAIL_ADMIN: process.env.EMAIL_ADMIN || "",
            SMTP_HOST: process.env.SMTP_HOST || "",
            SMTP_PORT: process.env.SMTP_PORT || "",
            SMTP_USER: process.env.SMTP_USER || "",
            SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",
            
            BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || "",
            DATA_GOV_API_KEY: process.env.DATA_GOV_API_KEY || "",
            CONGRESS_GOV_API_KEY: process.env.CONGRESS_GOV_API_KEY || "",
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