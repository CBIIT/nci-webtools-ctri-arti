# Production Troubleshooting Guide

General-purpose guide for debugging issues in the Research Optimizer AWS infrastructure.

## Prerequisites

- AWS CLI v2
- An AWS SSO profile with PowerUser access

```bash
# Login before running any commands
aws sso login --profile <your-profile>
```

Set shell variables used throughout this guide:

```bash
PROFILE="<your-profile>"
REGION="us-east-1"
TIER="dev"  # or "qa"
PREFIX="ctri-research-optimizer-${TIER}"
```

## Naming Convention

Resources follow the pattern `ctri-research-optimizer-{tier}`:

| Resource             | Name/Identifier                                                   |
| -------------------- | ----------------------------------------------------------------- |
| ECS Cluster          | `ctri-research-optimizer-{tier}`                                  |
| CloudWatch Log Group | `ctri-research-optimizer-{tier}`                                  |
| Aurora Cluster       | `ctri-research-optimizer-{tier}`                                  |
| Secrets Manager      | Look up via `aws secretsmanager list-secrets` (has random suffix) |

## 1. CloudWatch Logs

The log group contains three log streams per ECS task, one per container: `main/main/{task-id}`, `gateway/gateway/{task-id}`, `cms/cms/{task-id}`.

### View recent errors

```bash
aws logs filter-log-events \
  --log-group-name "$PREFIX" \
  --start-time $(date -d '30 minutes ago' +%s000) \
  --filter-pattern "?ERROR ?error ?FATAL ?Exception ?fail" \
  --max-items 50 \
  --profile $PROFILE --region $REGION
```

### View all logs from a time range

```bash
aws logs filter-log-events \
  --log-group-name "$PREFIX" \
  --start-time $(date -d '1 hour ago' +%s000) \
  --end-time $(date +%s000) \
  --profile $PROFILE --region $REGION
```

### Filter by container

Use `--log-stream-name-prefix` to isolate a container. Container names: `main`, `gateway`, `cms`.

```bash
aws logs filter-log-events \
  --log-group-name "$PREFIX" \
  --log-stream-name-prefix "main/main/" \
  --start-time $(date -d '15 minutes ago' +%s000) \
  --profile $PROFILE --region $REGION
```

### Follow logs from a specific task

Extract the task ID from a log stream name (e.g. `main/main/<task-id>`) and view all containers for that task:

```bash
TASK_ID="<task-id>"
# main container
aws logs get-log-events --log-group-name "$PREFIX" --log-stream-name "main/main/$TASK_ID" --profile $PROFILE --region $REGION
# gateway container
aws logs get-log-events --log-group-name "$PREFIX" --log-stream-name "gateway/gateway/$TASK_ID" --profile $PROFILE --region $REGION
# cms container
aws logs get-log-events --log-group-name "$PREFIX" --log-stream-name "cms/cms/$TASK_ID" --profile $PROFILE --region $REGION
```

### List recent log streams (to find task IDs)

```bash
aws logs describe-log-streams \
  --log-group-name "$PREFIX" \
  --order-by LastEventTime \
  --descending \
  --max-items 10 \
  --profile $PROFILE --region $REGION
```

## 2. ECS Service

### List services in a cluster

```bash
aws ecs list-services \
  --cluster $PREFIX \
  --profile $PROFILE --region $REGION
```

### Check service health and recent events

```bash
aws ecs describe-services \
  --cluster $PREFIX \
  --services <service-name> \
  --query "services[0].{status:status,desired:desiredCount,running:runningCount,pending:pendingCount,deployments:deployments[*].{status:status,desired:desiredCount,running:runningCount,rollout:rolloutState},events:events[:10]}" \
  --profile $PROFILE --region $REGION
```

### List tasks (running and recently stopped)

```bash
# Running tasks
aws ecs list-tasks --cluster $PREFIX --profile $PROFILE --region $REGION

# Recently stopped tasks
aws ecs list-tasks --cluster $PREFIX --desired-status STOPPED --profile $PROFILE --region $REGION
```

### Inspect a task (stop reason, exit codes)

```bash
aws ecs describe-tasks \
  --cluster $PREFIX \
  --tasks <task-arn> \
  --query "tasks[0].{lastStatus:lastStatus,stopCode:stopCode,stoppedReason:stoppedReason,stoppedAt:stoppedAt,containers:containers[*].{name:name,lastStatus:lastStatus,exitCode:exitCode,reason:reason}}" \
  --profile $PROFILE --region $REGION
```

### Force a new deployment

```bash
aws ecs update-service \
  --cluster $PREFIX \
  --service <service-name> \
  --force-new-deployment \
  --profile $PROFILE --region $REGION
```

### Connect to a running container (ECS Exec)

ECS Exec is enabled on all containers, allowing interactive shell access. Requires the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) installed locally.

```bash
# Get a running task ID
TASK_ID=$(aws ecs list-tasks --cluster $PREFIX \
  --query "taskArns[0]" --output text \
  --profile $PROFILE --region $REGION)

# Shell into the main container
aws ecs execute-command \
  --cluster $PREFIX \
  --task $TASK_ID \
  --container main \
  --interactive \
  --command "/bin/sh" \
  --profile $PROFILE --region $REGION
```

Container names: `main`, `gateway`, `cms`. Useful for:

- Checking running processes: `ps aux`
- Viewing stdout/stderr: `cat /proc/1/fd/1` (stdout) / `cat /proc/1/fd/2` (stderr)
- Checking environment variables: `env | grep PG`
- Testing database connectivity: `node -e "import('postgres').then(m => m.default({ssl:{rejectUnauthorized:false}})\`SELECT 1\`.then(console.log))"`
- Checking memory/cpu: `cat /proc/meminfo`, `top -bn1`
- Inspecting files, logs, or node_modules
- Running one-off scripts

### Verify ECS Exec agent status

```bash
aws ecs describe-tasks \
  --cluster $PREFIX \
  --tasks $TASK_ID \
  --query "tasks[0].containers[*].{name:name,execAgent:managedAgents[?name=='ExecuteCommandAgent'].lastStatus|[0]}" \
  --profile $PROFILE --region $REGION
```

## 3. Aurora PostgreSQL (via RDS Data API)

The Data API lets you run SQL without a direct database connection. You need the cluster ARN and the Secrets Manager ARN for credentials.

### Find resource ARNs

```bash
# Cluster ARN
aws rds describe-db-clusters \
  --db-cluster-identifier "$PREFIX" \
  --query "DBClusters[0].DBClusterArn" --output text \
  --profile $PROFILE --region $REGION

# Secret ARN
aws secretsmanager list-secrets \
  --query "SecretList[?contains(Name, '$PREFIX')].{Name:Name,ARN:ARN}" \
  --profile $PROFILE --region $REGION
```

### Run an arbitrary SQL query

```bash
CLUSTER_ARN="<cluster-arn-from-above>"
SECRET_ARN="<secret-arn-from-above>"

aws rds-data execute-statement \
  --resource-arn "$CLUSTER_ARN" \
  --secret-arn "$SECRET_ARN" \
  --database postgres \
  --sql "<your SQL here>" \
  --profile $PROFILE --region $REGION
```

### Useful diagnostic queries

```sql
-- List schemas
SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;

-- List all tables
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;

-- Check active connections
SELECT usename, datname, client_addr, state, query_start, query
FROM pg_stat_activity WHERE datname = 'postgres';

-- Check Drizzle migration history
SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC;

-- Check table row counts (useful for verifying seed data)
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname;

-- Check database size
SELECT pg_size_pretty(pg_database_size('postgres'));
```

### Check RDS cluster status

```bash
aws rds describe-db-clusters \
  --db-cluster-identifier "$PREFIX" \
  --query "DBClusters[0].{Status:Status,Engine:Engine,EngineVersion:EngineVersion,Endpoint:Endpoint,ReaderEndpoint:ReaderEndpoint,Capacity:Capacity}" \
  --profile $PROFILE --region $REGION
```

## 4. Secrets and Configuration

### View SSM parameters (app configuration)

```bash
aws ssm get-parameters-by-path \
  --path "/$PREFIX/" \
  --query "Parameters[*].{Name:Name,Value:Value}" \
  --with-decryption \
  --profile $PROFILE --region $REGION
```

### View database credentials from Secrets Manager

```bash
aws secretsmanager get-secret-value \
  --secret-id "$PREFIX" \
  --query "SecretString" \
  --output text \
  --profile $PROFILE --region $REGION | python -m json.tool
```

### View current ECS task definition (environment variables and secrets)

```bash
# Get the service's current task definition
TASK_DEF=$(aws ecs describe-services --cluster $PREFIX --services <service-name> \
  --query "services[0].taskDefinition" --output text \
  --profile $PROFILE --region $REGION)

# Inspect it
aws ecs describe-task-definition \
  --task-definition "$TASK_DEF" \
  --query "taskDefinition.containerDefinitions[*].{name:name,image:image,env:environment[*].name,secrets:secrets[*].name}" \
  --profile $PROFILE --region $REGION
```

## 5. CloudFormation Stacks

### Check stack status

```bash
# All stacks for this prefix
aws cloudformation describe-stacks \
  --query "Stacks[?starts_with(StackName, '$PREFIX')].{Name:StackName,Status:StackStatus,Updated:LastUpdatedTime}" \
  --output table \
  --profile $PROFILE --region $REGION
```

### Check a specific stack

```bash
aws cloudformation describe-stacks \
  --stack-name "$PREFIX-ecs-service" \
  --query "Stacks[0].{Status:StackStatus,StatusReason:StackStatusReason,Updated:LastUpdatedTime,Outputs:Outputs}" \
  --profile $PROFILE --region $REGION
```

### View recent stack events (deployments, errors)

```bash
aws cloudformation describe-stack-events \
  --stack-name "$PREFIX-ecs-service" \
  --query "StackEvents[:20].{Time:Timestamp,Status:ResourceStatus,Type:ResourceType,Reason:ResourceStatusReason}" \
  --output table \
  --profile $PROFILE --region $REGION
```

### Check for failed or in-progress stacks

```bash
aws cloudformation list-stacks \
  --stack-status-filter CREATE_FAILED UPDATE_FAILED ROLLBACK_COMPLETE UPDATE_ROLLBACK_COMPLETE UPDATE_IN_PROGRESS CREATE_IN_PROGRESS \
  --query "StackSummaries[?starts_with(StackName, '$PREFIX')].{Name:StackName,Status:StackStatus}" \
  --profile $PROFILE --region $REGION
```

## 6. Debugging Workflow

When a service is unhealthy, follow this order:

1. **Check ECS service events** — look for deployment failures, task placement errors, or health check failures
2. **Find the latest stopped task** — get the stop reason and container exit codes
3. **Read the `main` container logs first** — it starts first; if it crashes, `gateway` and `cms` get SIGTERM (so their errors are usually a symptom, not the cause)
4. **Check the error `cause`** — Drizzle wraps errors; the real issue is in the `cause` field (e.g. SSL, auth, network)
5. **Verify database connectivity** — use the Data API to confirm the database is reachable and credentials work
6. **Check secrets/config** — ensure SSM parameters and Secrets Manager values are populated correctly
