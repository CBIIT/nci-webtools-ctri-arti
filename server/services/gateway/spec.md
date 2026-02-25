# Gateway Service Spec

The Gateway service handles AI model inference and usage tracking. It runs either embedded in the main server (monolith mode) or as a standalone microservice on port 3001.

## Entry Point

`server/gateway.js` — Standalone Express server that mounts the Gateway API router.

## API (`api.js`)

Internal service API for AI inference.

Middleware stack: `json({ limit: 1GB })` → `logRequests()` → routes → `logErrors()`

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/infer` | None (userId optional in body) | Run AI inference with optional usage tracking |
| GET | `/api/models` | None | List available models |

### POST /api/infer

**Request Body:**
```json
{
  "userId": 1,
  "model": "us.anthropic.claude-opus-4-6-v1",
  "messages": [{ "role": "user", "content": [{ "text": "Hello" }] }],
  "system": "System prompt text",
  "tools": [{ "toolSpec": { ... } }],
  "thoughtBudget": 5000,
  "stream": true,
  "ip": "127.0.0.1"
}
```

**Behavior:**
1. Rate limit check: if `userId` provided and `user.remaining <= 0`, returns 429
2. Calls `runModel()` with inference parameters
3. Non-streaming: tracks usage, returns JSON result
4. Streaming: writes newline-delimited JSON, tracks usage on metadata message

**Rate Limit Response (429):**
```json
{ "error": "You have reached your allocated weekly usage limit..." }
```

### GET /api/models

**Response:**
```json
[
  { "name": "Opus 4.6", "internalName": "us.anthropic.claude-opus-4-6-v1", "maxContext": 200000, "maxOutput": 64000, "maxReasoning": 60000 }
]
```

Only returns models with `providerId: 1` (Bedrock).

## Inference Engine (`inference.js`)

Core AI inference orchestrator. Supports multiple providers (Bedrock, Gemini, Mock).

### Exports

| Function | Description |
|----------|-------------|
| `runModel({ model, messages, system, tools, thoughtBudget, stream, outputConfig })` | Main inference entry point |
| `getModelProvider(internalName)` | Look up model and instantiate its provider |
| `estimateContentTokens(content)` | Estimate tokens for a content item |
| `calculateCacheBoundaries(maxTokens)` | Compute cache boundary positions using sqrt(2) scaling |
| `addCachePointsToMessages(messages, hasCache)` | Insert cache points at optimal positions |

### runModel Flow

```
1. Validate inputs (model, messages required)
2. processMessages(messages, thoughtBudget)
   - Filter null messages/content
   - Strip reasoning content when thoughtBudget=0
   - Convert base64 bytes → Uint8Array
   - Interleave missing tool results
3. buildInferenceParams(...)
   - Look up model + provider from DB
   - Calculate cache positions
   - Add cache points to messages, system, tools
   - Build thinking/beta config
4. Call provider.converse() or provider.converseStream()
5. Log cache debug info (non-streaming only)
6. Return result
```

### Cache Point Strategy

Uses sqrt(2) scaling factor to place cache boundaries at exponentially increasing intervals starting at 1024 tokens. Only the last 2 cache positions are kept to stay within provider limits.

Cache points are added to:
- Messages: at the message crossing each boundary
- System prompt: after the text content
- Tools: after the last tool spec

### Provider Interface

All providers implement:
- `converse(input)` → `{ content, usage, stopReason }`
- `converseStream(input)` → `{ stream: AsyncGenerator<message> }`

Available providers:
- `bedrock` — AWS Bedrock (Anthropic Claude, Meta Llama)
- `gemini` — Google Gemini
- `mock` — Test provider

## Usage Tracking (`usage.js`)

Shared between gateway client (monolith) and gateway API (microservice).

### trackModelUsage(userId, modelValue, ip, usageData)

1. Looks up model by `internalName`
2. Calculates cost: `(tokens / 1000) * cost1kRate` for input, output, cache read, cache write
3. Creates `Usage` record with all token counts and computed cost
4. Decrements `user.remaining` by total cost

**Parameters:**
- `userId` — User ID (skip if null)
- `modelValue` — Model internalName string
- `ip` — Client IP address
- `usageData` — `{ inputTokens, outputTokens, cacheReadInputTokens, cacheWriteInputTokens }`

## Client (`clients/gateway.js`)

Factory-pattern client that abstracts monolith/microservice modes. Resolved once at module load time based on `GATEWAY_URL` environment variable.

### Exports

| Function | Description |
|----------|-------------|
| `infer({ userId, model, messages, system, tools, thoughtBudget, stream, ip, outputConfig })` | Run inference with rate limiting and usage tracking |
| `listModels()` | List available models |

### Modes

**Direct (monolith):** Calls `runModel()` directly. Handles rate limiting locally. Wraps streaming to track usage on metadata messages.

**HTTP (microservice):** POSTs to `GATEWAY_URL/api/infer`. Parses streaming responses from newline-delimited JSON.
