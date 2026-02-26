# cms

Conversation Management Service — CRUD operations for agents, threads, messages, resources, and vectors.

## Overview

The CMS manages the conversation data model. It contains no inference logic or auth decisions — just data operations scoped by userId. Runs either embedded in the main server (monolith mode) or as a standalone microservice on port 3002.

## Quick Start

```bash
# Standalone microservice
npm start -w cms

# Or via docker compose (starts automatically)
docker compose up --build -w
```

## API Reference

All requests must include an `X-User-Id` header. Returns `400` if missing.

| Resource | Endpoints | Description |
|----------|-----------|-------------|
| Agents | `POST`, `GET`, `GET /:id`, `PUT /:id`, `DELETE /:id` | Agent CRUD |
| Threads | `POST`, `GET`, `GET /:id`, `PUT /:id`, `DELETE /:id` | Thread CRUD with pagination |
| Messages | `POST`, `GET`, `PUT /:id`, `DELETE /:id` | Message CRUD |
| Resources | `POST`, `GET /:id`, `GET` by thread, `DELETE /:id` | Resource CRUD |
| Vectors | `POST`, `GET` by thread | Vector storage |

See [openapi.yaml](openapi.yaml) for full request/response schemas.

### Pagination

`GET /threads` returns a normalized paginated response:

```json
{
  "data": [...],
  "meta": { "total": 42, "limit": 20, "offset": 0 }
}
```

## Architecture

### ConversationService (`conversation.js`)

Core business logic class. All methods take `userId` as first parameter for ownership scoping.

#### Agent Methods

| Method | Parameters | Returns | Notes |
|--------|-----------|---------|-------|
| `createAgent(userId, data)` | `{ name, promptId?, tools? }` | Agent | Sets userId on creation |
| `getAgent(userId, agentId)` | — | Agent \| null | User's OR global agents. Flattens `Prompt.content` → `systemPrompt`. |
| `getAgents(userId)` | — | Agent[] | User's + global agents, ordered by createdAt DESC |
| `updateAgent(userId, agentId, updates)` | — | Agent \| null | Only updates user-owned agents |
| `deleteAgent(userId, agentId)` | — | number | Cascading: deletes threads, messages, resources, vectors |

#### Thread Methods

| Method | Parameters | Returns | Notes |
|--------|-----------|---------|-------|
| `createThread(userId, data)` | `{ name?, agentId? }` | Thread | |
| `getThread(userId, threadId)` | — | Thread \| null | Scoped to userId |
| `getThreads(userId, options)` | `{ limit?, offset? }` | `{ count, rows }` | Paginated, ordered by createdAt DESC |
| `updateThread(userId, threadId, updates)` | — | Thread \| null | |
| `deleteThread(userId, threadId)` | — | number | Cascading: destroys messages, resources, vectors |

#### Message Methods

| Method | Parameters | Returns | Notes |
|--------|-----------|---------|-------|
| `addMessage(userId, threadId, data)` | `{ role, content, agentId? }` | Message | |
| `getMessages(userId, threadId)` | — | Message[] | Ordered by createdAt ASC |
| `getMessage(userId, messageId)` | — | Message \| null | |
| `updateMessage(userId, messageId, updates)` | — | Message \| null | |
| `deleteMessage(userId, messageId)` | — | number | |

#### Resource Methods

| Method | Parameters | Returns | Notes |
|--------|-----------|---------|-------|
| `addResource(userId, data)` | `{ name, type, content, threadId?, s3Uri?, metadata? }` | Resource | |
| `getResource(userId, resourceId)` | — | Resource \| null | |
| `getResourcesByThread(userId, threadId)` | — | Resource[] | Ordered by createdAt ASC |
| `deleteResource(userId, resourceId)` | — | number | Cascading: destroys vectors |

#### Vector Methods

| Method | Parameters | Returns | Notes |
|--------|-----------|---------|-------|
| `addVectors(userId, threadId, vectors)` | `[{ text, embedding?, resourceId?, order? }]` | Vector[] | Bulk create. Order defaults to array index. |
| `getVectorsByThread(userId, threadId)` | — | Vector[] | Ordered by order ASC |
| `getVectorsByResource(userId, resourceId)` | — | Vector[] | Ordered by order ASC |
| `deleteVectorsByThread(userId, threadId)` | — | number | |

### Ownership Model

All operations enforce user ownership via `WHERE userId = :userId`. Exceptions:
- `getAgent` and `getAgents` also return global agents where `userId IS NULL`
- Global agents cannot be modified or deleted through user endpoints (returns `403`)

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3002 | Service port |
| `DB_DIALECT` | No | postgres | `postgres` or `sqlite` |
| `DB_SKIP_SYNC` | No | false | Skip schema sync (set `true` in microservice mode) |
| `PGHOST` | Prod | — | PostgreSQL host |
| `PGUSER` | Prod | — | PostgreSQL user |
| `PGPASSWORD` | Prod | — | PostgreSQL password |

## Data Ownership

| Operation | Models |
|-----------|--------|
| **Owns (reads/writes)** | Agent, Thread, Message, Resource, Vector |
| **Reads** | Prompt (for agent resolution) |

## Client Integration

The server connects to CMS via `server/services/clients/cms.js`, a factory-pattern client:

- **Direct mode** (no `CMS_URL`): Instantiates `ConversationService` and calls methods directly.
- **HTTP mode** (`CMS_URL` set): Makes HTTP requests with `X-User-Id` header.

```js
import { createThread, addMessage, getMessages } from "./services/clients/cms.js";

const thread = await createThread(userId, { name: "New Chat", agentId: 1 });
await addMessage(userId, thread.id, { role: "user", content: [{ text: "Hello" }] });
const messages = await getMessages(userId, thread.id);
```
