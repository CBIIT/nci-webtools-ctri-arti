# agents

Chat orchestration service (stub).

## Overview

The agents service is the orchestration layer for AI chat. When a user sends a message, this service handles the full round-trip: resolve agent config, fetch conversation history, call gateway for inference, persist the response, and handle tool execution loops.

## Quick Start

```bash
npm start -w agents
```

## API

| Method | Path                                                      | Description                                  |
| ------ | --------------------------------------------------------- | -------------------------------------------- |
| GET    | `/health`                                                 | Health check — returns `{ status: "ok" }`    |
| POST   | `/api/agents/:agentId/conversations/:conversationId/chat` | Send a message, get streamed NDJSON response |

## Responsibilities

- Resolve agent configuration from CMS (system prompt, tools, model)
- Fetch conversation history from CMS
- Call gateway for streaming inference
- Persist assistant responses back to CMS
- Handle tool execution loops (search, browse, data, editor, think, docxTemplate)

## Configuration

| Variable | Required | Default | Description  |
| -------- | -------- | ------- | ------------ |
| `PORT`   | No       | 3003    | Service port |
