import { Config } from "../types";

export const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID  || "";
export const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "";
export const vpc = process.env.VPC || "";
export const subnets = process.env.SUBNETS?.split(",") || [];
export const namespace = process.env.NAMESPACE || "";
export const application = process.env.APPLICATION || "";
export const tier = process.env.TIER || "";
export const prefix = [namespace, application, tier].join("-");

// Shared secrets used by all services
const sharedSecrets = {
  PGHOST: [prefix, "host"] as [string, string],
  PGPORT: [prefix, "port"] as [string, string],
  PGDATABASE: [prefix, "dbname"] as [string, string],
  PGUSER: [prefix, "username"] as [string, string],
  PGPASSWORD: [prefix, "password"] as [string, string],
};

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
      // Increased memory/cpu for 3 containers
      memoryLimitMiB: 4096,
      cpu: 2048,
      containers: [
        // Main app - serves client and proxies to internal services
        {
          image: process.env.MAIN_IMAGE || process.env.SERVER_IMAGE || "httpd",
          name: "main",
          portMappings: [
            {
              name: "main",
              containerPort: 80,
            }
          ],
          environment: {
            PORT: "80",
            VERSION: process.env.GITHUB_SHA || "latest",
            // Internal service URLs (same task = same network namespace = localhost)
            GATEWAY_URL: "http://localhost:3001",
            CMS_URL: "http://localhost:3002",
          },
          secrets: {
            TIER: tier,
            SESSION_SECRET: process.env.SESSION_SECRET || "",
            OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID || "",
            OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET || "",
            OAUTH_CALLBACK_URL: process.env.OAUTH_CALLBACK_URL || "",
            OAUTH_DISCOVERY_URL: process.env.OAUTH_DISCOVERY_URL || "",

            ...sharedSecrets,

            S3_BUCKETS: process.env.S3_BUCKETS || "rh-eagle",

            EMAIL_ADMIN: process.env.EMAIL_ADMIN || "",
            EMAIL_DEV: process.env.EMAIL_DEV || "",
            EMAIL_USER_REPORTS: process.env.EMAIL_USER_REPORTS || "",
            SMTP_HOST: process.env.SMTP_HOST || "",
            SMTP_PORT: process.env.SMTP_PORT || "",
            SMTP_USER: process.env.SMTP_USER || "",
            SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",

            BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || "",
            DATA_GOV_API_KEY: process.env.DATA_GOV_API_KEY || "",
            CONGRESS_GOV_API_KEY: process.env.CONGRESS_GOV_API_KEY || "",
          }
        },
        // Gateway service - AI inference
        {
          image: process.env.GATEWAY_IMAGE || "httpd",
          name: "gateway",
          portMappings: [
            {
              name: "gateway",
              containerPort: 3001,
            }
          ],
          environment: {
            PORT: "3001",
            DB_SKIP_SYNC: "true",
          },
          secrets: {
            ...sharedSecrets,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
          }
        },
        // CMS service - conversation management
        {
          image: process.env.CMS_IMAGE || "httpd",
          name: "cms",
          portMappings: [
            {
              name: "cms",
              containerPort: 3002,
            }
          ],
          environment: {
            PORT: "3002",
            DB_SKIP_SYNC: "true",
          },
          secrets: {
            ...sharedSecrets,
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
