# infrastructure

AWS CDK v2 deployment for the current service layout.

This directory describes and deploys the ECS/Fargate shape of the app, not the direct local monolith. In AWS, the edge server still runs as the public entrypoint, but the backend services run as separate containers in the same ECS task.

## Transport Parity

Infrastructure changes must preserve the intended parity between direct mode and HTTP mode.
When introducing or changing service boundaries, URLs, env wiring, or deploy topology, make sure
the corresponding app, HTTP, remote, and parity-test layers stay aligned in the same change.

## Current Topology

The deployed task currently includes five containers:

- `main`: the `server` app, exposed through the ALB
- `gateway`: model inference and guardrails
- `cms`: conversations, agents, resources, vectors, tools, and prompts
- `agents`: chat orchestration
- `users`: users, roles, budgets, usage, and analytics

Internal service URLs are wired over localhost inside the same task:

- `GATEWAY_URL=http://localhost:3001`
- `CMS_URL=http://localhost:3002`
- `AGENTS_URL=http://localhost:3003`
- `USERS_URL=http://localhost:3004`

That means AWS runs in HTTP mode, while local direct mode still exists for development.

## Directory Shape

- [app.py](app.py): CDK app entrypoint
- [config.py](config.py): environment-driven stack configuration and container definitions
- [deploy.sh](deploy.sh): image build, push, and deploy script
- [stacks/ecr.py](stacks/ecr.py): ECR repository stack
- [stacks/ecs.py](stacks/ecs.py): ECS service stack
- [stacks/rds.py](stacks/rds.py): Aurora/Postgres stack
- [templates/](templates/): retained infra templates and references

## What The CDK Config Actually Does

### ECR

Creates a single repository named from `{NAMESPACE}-{APPLICATION}-{TIER}`.

### ECS

Creates:

- a Fargate cluster
- one service running the five-container task definition
- an ALB target group and host-header listener rule
- autoscaling on CPU and memory
- CloudWatch logs

Important runtime facts from the current config:

- task size: `2 vCPU`, `4 GB`
- desired count: `1`
- autoscaling range: `1` to `4`
- all service containers run with `DB_SKIP_SYNC=true`
- only `main` is directly exposed through the ALB

### RDS

Defines an Aurora Serverless PostgreSQL cluster and database credentials in Secrets Manager.

The RDS stack exists in code, but the current deploy script does not automatically deploy it.

## Deployment Flow

The current [deploy.sh](deploy.sh) does this:

1. load `infrastructure/.env` when present
2. deploy the ECR stack
3. build and push five images:
   - `main`
   - `gateway`
   - `cms`
   - `agents`
   - `users`
4. deploy the ECS stack

The script currently leaves the RDS deploy line commented out.

## Environment Variables

Configuration is loaded from [config.py](config.py) and [`.env.example`](.env.example).

### Required

- `AWS_ACCOUNT_ID`
- `AWS_REGION`
- `VPC`
- `SUBNETS`
- `NAMESPACE`
- `APPLICATION`
- `TIER`
- `DOMAIN_NAME`

### Optional

- `ALT_DOMAIN_NAME`
- `AWS_PROFILE`
- `GITHUB_SHA`

### Image Overrides

These can be supplied manually, though `deploy.sh` usually computes them:

- `MAIN_IMAGE`
- `GATEWAY_IMAGE`
- `CMS_IMAGE`
- `AGENTS_IMAGE`
- `USERS_IMAGE`

Legacy `SERVER_IMAGE` still exists as a compatibility fallback for `MAIN_IMAGE`.

### App Secrets Passed To Containers

`main` receives:

- `SESSION_SECRET`
- `OAUTH_CLIENT_ID`
- `OAUTH_CLIENT_SECRET`
- `OAUTH_CALLBACK_URL`
- `OAUTH_DISCOVERY_URL`
- `S3_BUCKETS`
- `EMAIL_ADMIN`
- `EMAIL_DEV`
- `EMAIL_USER_REPORTS`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `BRAVE_SEARCH_API_KEY`
- `DATA_GOV_API_KEY`
- `CONGRESS_GOV_API_KEY`

`gateway` receives:

- `GEMINI_API_KEY`

`agents` currently also receives:

- `BRAVE_SEARCH_API_KEY`
- `DATA_GOV_API_KEY`
- `S3_BUCKETS`

All service containers receive database credentials via Secrets Manager:

- `PGHOST`
- `PGPORT`
- `PGDATABASE`
- `PGUSER`
- `PGPASSWORD`

## Local Infra Workflow

```bash
cd infrastructure
cp .env.example .env
```

Then either:

- run `cdk diff` / `cdk synth` directly for inspection
- run `bash deploy.sh` to build images and deploy the current configured stacks

If using SSO locally, set `AWS_PROFILE` before running `deploy.sh`.

## Notes

- This README reflects the current five-service backend layout.
- If this file drifts again, trust [config.py](config.py), [deploy.sh](deploy.sh), and [stacks/ecs.py](stacks/ecs.py).
- The old three-container description is obsolete.
