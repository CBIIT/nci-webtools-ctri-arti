# infrastructure-v2

AWS CDK v2 (Python) infrastructure for deploying the Research Optimizer platform.

## Overview

Three CDK stacks deploy the application to AWS:

| Stack | Resource | Description |
|-------|----------|-------------|
| `{prefix}-ecr-repository` | ECR | Docker image registry with auto-cleanup |
| `{prefix}-ecs-service` | ECS Fargate | 3-container task (main, gateway, cms) behind ALB |
| `{prefix}-rds-cluster` | RDS Aurora | Serverless v2 PostgreSQL with auto-pause |

The `prefix` is `{NAMESPACE}-{APPLICATION}-{TIER}` (e.g., `ctri-research-optimizer-dev`).

## Prerequisites

- Python 3.9+
- AWS CDK v2 (`npm install -g aws-cdk`)
- AWS CLI configured with appropriate credentials
- CDK bootstrap completed in target account

## Quick Start

```bash
cd infrastructure-v2
pip install -r requirements.txt
cp .env.example .env   # Configure environment variables
cdk diff               # Preview changes
cdk deploy --all       # Deploy all stacks
```

## Configuration

Configuration is loaded from environment variables via `config.py`.

### Required Variables

| Variable | Description |
|----------|-------------|
| `AWS_ACCOUNT_ID` | AWS account ID |
| `AWS_REGION` | AWS region |
| `VPC` | VPC name (looked up by name, not ID) |
| `SUBNETS` | Comma-separated subnet IDs |
| `NAMESPACE` | Resource namespace (e.g., `ctri`) |
| `APPLICATION` | Application name (e.g., `research-optimizer`) |
| `TIER` | Environment tier (e.g., `dev`, `staging`, `prod`) |
| `DOMAIN_NAME` | Application domain name |

### Container Images

| Variable | Description |
|----------|-------------|
| `MAIN_IMAGE` | Main server container image URI |
| `GATEWAY_IMAGE` | Gateway service container image URI |
| `CMS_IMAGE` | CMS service container image URI |

### Application Secrets

Stored as SSM Parameters, injected into containers at runtime:

| Variable | Description |
|----------|-------------|
| `SESSION_SECRET` | Cookie signing secret |
| `OAUTH_CLIENT_ID` | OIDC client ID |
| `OAUTH_CLIENT_SECRET` | OIDC client secret |
| `OAUTH_CALLBACK_URL` | OIDC redirect URI |
| `OAUTH_DISCOVERY_URL` | OIDC discovery URL |
| `GEMINI_API_KEY` | Google Gemini API key |
| `BRAVE_SEARCH_API_KEY` | Brave Search API key |
| `S3_BUCKETS` | Allowed S3 buckets |

Database credentials (PGHOST, PGUSER, PGPASSWORD, etc.) are pulled from Secrets Manager, created by the RDS stack.

## Stack Details

### ECR Repository

- Creates container registry named `{prefix}`
- Enables image scanning on push
- Auto-deletes untagged images

### ECS Service

- **Task definition:** 2 vCPU, 4 GB memory
- **Containers:** 3 per task (main:80, gateway:3001, cms:3002)
- **Networking:** Same task = same network namespace (containers communicate via localhost)
- **Load balancer:** Attaches to existing ALB via listener lookup
- **Autoscaling:** 1–4 tasks, 70% CPU/memory target
- **Logging:** CloudWatch with 1-month retention

IAM permissions granted to tasks:
- Amazon Bedrock (AI inference)
- Amazon RDS Data API
- Secrets Manager
- Amazon Translate, Polly, Textract
- Amazon S3

### RDS Cluster

- Aurora Serverless v2, PostgreSQL 16
- Auto-scales 0–1 ACU (configurable)
- Auto-pause after 5 minutes of inactivity
- 7-day backup retention
- Data API enabled

## Docker Image Strategy

All services share a single base `Dockerfile` at the project root. Service-specific images override only the `CMD`:

```
Dockerfile      → main image    (CMD: npm start -w server)
gateway/Dockerfile → gateway image (FROM main, CMD: npm start -w gateway)
cms/Dockerfile  → cms image     (FROM main, CMD: npm start -w cms)
```

## CI/CD Pipeline

The `deploy.sh` script at the project root orchestrates deployment:

1. Deploy ECR stack
2. Build and push 3 Docker images (main, gateway, cms)
3. Deploy ECS stack

```bash
# Required environment variables
export AWS_ACCOUNT_ID=...
export AWS_REGION=...
export TIER=dev
export GITHUB_SHA=$(git rev-parse HEAD)

./deploy.sh
```

## Deployment Order

For a fresh deployment:

1. `{prefix}-ecr-repository` — Create container registry
2. Push Docker images to ECR
3. `{prefix}-rds-cluster` — Create database (generates credentials in Secrets Manager)
4. `{prefix}-ecs-service` — Deploy application containers

## CDK Bootstrap

Before first deployment, bootstrap CDK in your account:

```bash
cdk bootstrap aws://ACCOUNT_ID/REGION \
  --qualifier hnb659fds \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
  --trust ACCOUNT_ID
```

## Commands

```bash
cdk diff                    # Preview changes
cdk synth                   # Generate CloudFormation templates
cdk deploy --all            # Deploy all stacks
cdk deploy {prefix}-ecs-service  # Deploy specific stack
cdk destroy --all           # Destroy all stacks (use with caution)
```
