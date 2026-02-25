# Research Optimizer Infrastructure

AWS CDK v2 infrastructure for deploying the Research Optimizer application.

## Architecture

| Stack | Purpose |
|-------|---------|
| **ECR Repository** | Docker image registry with automatic cleanup of untagged images |
| **ECS Service** | Fargate service with ALB, autoscaling, and execute command support |
| **RDS Cluster** | Aurora Serverless v2 PostgreSQL with Data API enabled |
| **EFS Filesystem** | Optional shared storage (currently disabled) |
| **Route53 Hosted Zone** | Optional DNS management (currently disabled) |

## Prerequisites

- Node.js 18+
- AWS CLI configured with appropriate credentials
- CDK bootstrap completed in target account (see Bootstrap section)

## Setup

```bash
cd infrastructure
npm install
cp .env.example .env  # Configure environment variables
```

## Environment Variables

Create a `.env` file with the following variables:

```bash
# AWS Configuration
AWS_ACCOUNT_ID=123456789012
AWS_REGION=us-east-1

# Network Configuration (from existing VPC)
VPC=your-vpc-name
SUBNETS=subnet-abc,subnet-def

# Naming (creates prefix: NAMESPACE-APPLICATION-TIER)
NAMESPACE=ctri
APPLICATION=idp
TIER=dev

# Domain Configuration
DOMAIN_NAME=app.example.com
ALT_DOMAIN_NAME=www.app.example.com  # Optional redirect

# Container Image
SERVER_IMAGE=123456789012.dkr.ecr.us-east-1.amazonaws.com/ctri-idp-dev:latest

# Application Secrets (stored in SSM Parameters)
SESSION_SECRET=your-session-secret
OAUTH_CLIENT_ID=your-oauth-client-id
OAUTH_CLIENT_SECRET=your-oauth-client-secret
OAUTH_CALLBACK_URL=https://app.example.com/auth/callback
OAUTH_DISCOVERY_URL=https://auth.example.com/.well-known/openid-configuration

# Optional API Keys
BRAVE_SEARCH_API_KEY=
DATA_GOV_API_KEY=
CONGRESS_GOV_API_KEY=
```

Database credentials are automatically pulled from Secrets Manager (created by the RDS stack).

## Commands

```bash
# Compile TypeScript
npm run build

# Watch mode for development
npm run watch

# Run tests
npm test

# Preview changes without deploying
npx cdk diff

# Generate CloudFormation templates
npx cdk synth

# Deploy all stacks
npx cdk deploy --all

# Deploy specific stack
npx cdk deploy ctri-idp-dev-ecs-service

# Deploy with AWS profile
npx cdk deploy --all --profile my-profile

# Destroy stacks (use with caution)
npx cdk destroy --all
```

## Environment Configuration

Configurations are stored in `config/environments/`. The `ENVIRONMENT` variable selects which config to use:

```bash
# Use dev configuration
ENVIRONMENT=default npx cdk synth

# Use custom environment
ENVIRONMENT=cms npx cdk synth
```

Available environments:
- `default` - Standard deployment configuration
- `cms` - CMS-specific configuration
- `gateway` - Gateway service configuration

## Stack Details

### ECR Repository Stack
- Creates container registry for Docker images
- Enables image scanning on push
- Auto-deletes untagged images after 10 days

### ECS Service Stack
- Fargate service with execute command enabled (for debugging)
- Attaches to existing ALB via listener lookup
- Autoscaling: 1-4 tasks based on CPU/memory utilization (70% target)
- Secrets injected from SSM Parameters and Secrets Manager
- CloudWatch logs with 1-month retention

**IAM Permissions granted to tasks:**
- Amazon Bedrock (AI inference)
- Amazon RDS Data API
- Secrets Manager
- Amazon Translate
- Amazon Polly
- Amazon S3
- EFS

### RDS Cluster Stack
- Aurora Serverless v2 PostgreSQL 16.6
- Auto-scales from 0 to 1 ACU (configurable)
- Auto-pause after 5 minutes of inactivity
- 7-day backup retention
- Data API enabled for serverless queries

## Bootstrap

This project uses a custom synthesizer with `power-user-*` role naming. Before first deployment, bootstrap CDK in your account:

```bash
npx cdk bootstrap aws://ACCOUNT_ID/REGION \
  --qualifier hnb659fds \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
  --trust ACCOUNT_ID
```

Or use the provided `bootstrap.yaml` CloudFormation template.

## Deployment Order

For a fresh deployment, stacks should be deployed in this order:

1. `*-ecr-repository` - Create container registry
2. Push Docker image to ECR
3. `*-rds-cluster` - Create database (generates credentials in Secrets Manager)
4. `*-ecs-service` - Deploy application

## Troubleshooting

**CDK synthesis fails with VPC lookup error:**
Ensure `VPC` environment variable matches an existing VPC name, not ID.

**ECS service fails to start:**
Check CloudWatch logs at `/aws/ecs/{prefix}`. Common issues:
- Database credentials not found in Secrets Manager
- Container image not found in ECR
- Security group doesn't allow database access

**Connect to running container:**
```bash
aws ecs execute-command \
  --cluster ctri-idp-dev \
  --task TASK_ID \
  --container main \
  --interactive \
  --command "/bin/sh"
```