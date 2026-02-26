# agents

Chat orchestration service (stub).

## Overview

The agents service will be the orchestration layer for AI chat. When a user sends a message, this service handles the full round-trip: resolve agent config, fetch thread history, call gateway for inference, persist the response, and handle tool execution loops.

**Status:** Stub — currently serves only a health check endpoint.

## Quick Start

```bash
npm start -w agents
```

## Current API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — returns `{ status: "ok" }` |

## Planned Responsibilities

- Resolve agent configuration from CMS (system prompt, tools, model)
- Fetch thread history from CMS
- Call gateway for streaming inference
- Persist assistant responses back to CMS
- Handle tool execution loops (search, browse, translate, textract, document parsing)
- Multi-agent framework (EAGLE)

### Planned API

- `POST /api/agents/:agentId/threads/:threadId/chat` — Send a message, get a response
- `GET /api/agents/:agentId/threads/:threadId` — Get full thread with messages

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3003 | Service port |
