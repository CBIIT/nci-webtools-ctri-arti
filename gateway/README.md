# gateway

Unified AI inference service with multi-provider support, usage tracking, and rate limiting.

## Overview

The Gateway service handles AI model inference across multiple providers (AWS Bedrock, Google Gemini). It runs either embedded in the main server (monolith mode) or as a standalone microservice on port 3001.

## Quick Start

```bash
# Standalone microservice
npm start -w gateway

# Or via docker compose (starts automatically)
docker compose up --build -w
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/infer` | Run AI inference with optional rate limiting and usage tracking |
| GET | `/api/models` | List available models (Bedrock provider) |

See [openapi.yaml](openapi.yaml) for full request/response schemas.

### POST /api/infer

Accepts a model name, messages, optional system prompt, tools, and thought budget. Returns an AI response either as a single JSON object or as a newline-delimited JSON stream.

**Rate limiting:** If `userId` is provided and the user's `remaining` balance is `<= 0`, returns `429`.

**Streaming protocol:** Each line is a JSON object. The final message contains `metadata.usage` for token tracking.

### GET /api/models

Returns models with `providerId: 1` (Bedrock). Response includes `name`, `internalName`, `maxContext`, `maxOutput`, `maxReasoning`.

## Architecture

```
POST /api/infer
  │
  ├── Rate limit check (if userId provided)
  │
  ├── runModel()
  │   ├── processMessages()
  │   │   ├── Filter null messages/content
  │   │   ├── Strip reasoning when thoughtBudget=0
  │   │   ├── Convert base64 bytes → Uint8Array
  │   │   └── Interleave missing tool results
  │   │
  │   ├── buildInferenceParams()
  │   │   ├── Look up model + provider from DB
  │   │   ├── Calculate cache positions (sqrt(2) scaling)
  │   │   ├── Add cache points to messages, system, tools
  │   │   └── Build thinking/beta config
  │   │
  │   └── provider.converse() or provider.converseStream()
  │
  └── trackModelUsage() (records tokens and cost)
```

### Provider Interface

All providers implement:
- `converse(input)` → `{ content, usage, stopReason }`
- `converseStream(input)` → `{ stream: AsyncGenerator<message> }`

| Provider | Module | Description |
|----------|--------|-------------|
| `bedrock` | `providers/bedrock.js` | AWS Bedrock (Claude, Llama) |
| `gemini` | `providers/gemini.js` | Google Gemini |
| `mock` | `providers/mock.js` | Test provider |

### Cache Point Strategy

Uses a sqrt(2) scaling factor to place cache boundaries at exponentially increasing intervals starting at 1024 tokens. Only the last 2 positions are kept to stay within provider limits.

Cache points are added to:
- **Messages** — at the message crossing each boundary
- **System prompt** — after the text content
- **Tools** — after the last tool spec

### Usage Tracking

`trackModelUsage(userId, model, ip, usageData)`:
1. Looks up model by `internalName`
2. Calculates cost: `(tokens / 1000) * cost1kRate` for input, output, cache read, cache write
3. Creates `Usage` record
4. Decrements `user.remaining` by total cost

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3001 | Service port |
| `AWS_ACCESS_KEY_ID` | Yes | — | AWS credentials for Bedrock |
| `AWS_SECRET_ACCESS_KEY` | Yes | — | AWS credentials |
| `AWS_REGION` | No | us-east-1 | AWS region |
| `GEMINI_API_KEY` | No | — | Google Gemini API key |
| `DB_DIALECT` | No | postgres | `postgres` or `sqlite` |
| `DB_SKIP_SYNC` | No | false | Skip schema sync (set `true` in microservice mode) |
| `PGHOST` | Prod | — | PostgreSQL host |
| `PGUSER` | Prod | — | PostgreSQL user |
| `PGPASSWORD` | Prod | — | PostgreSQL password |

## Data Ownership

| Operation | Models |
|-----------|--------|
| **Reads** | Model, Provider, User |
| **Writes** | Usage |

## Client Integration

The server connects to gateway via `server/services/clients/gateway.js`, a factory-pattern client:

- **Direct mode** (no `GATEWAY_URL`): Calls `runModel()` directly, handles rate limiting and usage tracking in-process.
- **HTTP mode** (`GATEWAY_URL` set): POSTs to `GATEWAY_URL/api/infer`, parses streaming responses from newline-delimited JSON.

```js
import { infer, listModels } from "./services/clients/gateway.js";

const result = await infer({
  userId: 1,
  model: "us.anthropic.claude-opus-4-6-v1",
  messages: [{ role: "user", content: [{ text: "Hello" }] }],
  stream: true,
});
```
