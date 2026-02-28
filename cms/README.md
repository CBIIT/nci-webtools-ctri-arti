# cms

Conversation Management Service — CRUD operations for agents, conversations, messages, tools, prompts, resources, and vectors.

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

All routes are mounted under `/api/v1`. All requests must include an `X-User-Id` header. Returns `400` if missing.

| Resource      | Endpoints                                            | Description                                  |
| ------------- | ---------------------------------------------------- | -------------------------------------------- |
| Agents        | `POST`, `GET`, `GET /:id`, `PUT /:id`, `DELETE /:id` | Agent CRUD                                   |
| Conversations | `POST`, `GET`, `GET /:id`, `PUT /:id`, `DELETE /:id` | Conversation CRUD with pagination            |
| Context       | `GET /conversations/:id/context`                     | Get conversation with messages and resources |
| Compress      | `POST /conversations/:id/compress`                   | Compress conversation with summary           |
| Messages      | `POST`, `GET`, `PUT /:id`, `DELETE /:id`             | Message CRUD                                 |
| Tools         | `POST`, `GET`, `GET /:id`, `PUT /:id`, `DELETE /:id` | Tool CRUD                                    |
| Prompts       | `POST`, `GET`, `GET /:id`, `PUT /:id`, `DELETE /:id` | Prompt CRUD                                  |
| Resources     | `POST`, `GET /:id`, `GET` by agent, `DELETE /:id`    | Resource CRUD                                |
| Vectors       | `POST`, `GET` by conversation, `GET /search`         | Vector storage and search                    |

See [openapi.yaml](openapi.yaml) for full request/response schemas.

### Pagination

`GET /api/v1/conversations` returns a normalized paginated response:

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

| Method                                  | Parameters                                            | Returns       | Notes                                                                                                       |
| --------------------------------------- | ----------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `createAgent(userId, data)`             | `{ name, description?, promptID?, modelParameters? }` | Agent         | Sets userID on creation                                                                                     |
| `getAgent(userId, agentId)`             | —                                                     | Agent \| null | User's OR global agents. Flattens `Prompt.content` → `systemPrompt`. Resolves tools via AgentTool junction. |
| `getAgents(userId)`                     | —                                                     | Agent[]       | User's + global agents, ordered by createdAt DESC                                                           |
| `updateAgent(userId, agentId, updates)` | `{ ...fields, tools? }`                               | Agent \| null | Only updates user-owned agents. Syncs AgentTool junction when `tools` array provided.                       |
| `deleteAgent(userId, agentId)`          | —                                                     | number        | Cascading: deletes conversations, messages, resources, vectors                                              |

#### Conversation Methods

| Method                                                | Parameters             | Returns              | Notes                                                       |
| ----------------------------------------------------- | ---------------------- | -------------------- | ----------------------------------------------------------- |
| `createConversation(userId, data)`                    | `{ title?, agentID? }` | Conversation         |                                                             |
| `getConversation(userId, conversationId)`             | —                      | Conversation \| null | Scoped to userId, excludes soft-deleted                     |
| `getConversations(userId, options)`                   | `{ limit?, offset? }`  | `{ count, rows }`    | Paginated, ordered by createdAt DESC, excludes soft-deleted |
| `updateConversation(userId, conversationId, updates)` | —                      | Conversation \| null |                                                             |
| `deleteConversation(userId, conversationId)`          | —                      | number               | Soft delete (sets `deleted: true`, `deletedAt`)             |

#### Context & Compress

| Method                                               | Parameters                      | Returns                                 | Notes                                                                |
| ---------------------------------------------------- | ------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| `getContext(userId, conversationId)`                 | —                               | `{ conversation, messages, resources }` | Returns full conversation context including message-linked resources |
| `compressConversation(userId, conversationId, data)` | `{ summary, summaryMessageID }` | Conversation                            | Sets summaryMessageID on the conversation                            |

#### Message Methods

| Method                                      | Parameters                     | Returns         | Notes                    |
| ------------------------------------------- | ------------------------------ | --------------- | ------------------------ |
| `addMessage(userId, conversationId, data)`  | `{ role, content, parentID? }` | Message         |                          |
| `getMessages(userId, conversationId)`       | —                              | Message[]       | Ordered by createdAt ASC |
| `getMessage(userId, messageId)`             | —                              | Message \| null |                          |
| `updateMessage(userId, messageId, updates)` | —                              | Message \| null |                          |
| `deleteMessage(userId, messageId)`          | —                              | number          |                          |

#### Tool Methods

| Method                        | Parameters            | Returns      | Notes                                                        |
| ----------------------------- | --------------------- | ------------ | ------------------------------------------------------------ |
| `createTool(data)`            | `{ name, type, ... }` | Tool         |                                                              |
| `getTool(toolId)`             | —                     | Tool \| null |                                                              |
| `getTools(userId)`            | —                     | Tool[]       | Returns builtin tools + user's tools (via UserTool junction) |
| `updateTool(toolId, updates)` | —                     | Tool \| null |                                                              |
| `deleteTool(toolId)`          | —                     | number       | Cascading: destroys vectors, AgentTool, UserTool records     |

#### Prompt Methods

| Method                            | Parameters                         | Returns        | Notes                             |
| --------------------------------- | ---------------------------------- | -------------- | --------------------------------- |
| `createPrompt(data)`              | `{ name, content, version?, ... }` | Prompt         |                                   |
| `getPrompt(promptId)`             | —                                  | Prompt \| null |                                   |
| `getPrompts(options)`             | —                                  | Prompt[]       | Ordered by name ASC, version DESC |
| `updatePrompt(promptId, updates)` | —                                  | Prompt \| null |                                   |
| `deletePrompt(promptId)`          | —                                  | number         |                                   |

#### Resource Methods

| Method                                 | Parameters                                                         | Returns          | Notes                       |
| -------------------------------------- | ------------------------------------------------------------------ | ---------------- | --------------------------- |
| `addResource(userId, data)`            | `{ name, type, content, agentID?, messageID?, s3Uri?, metadata? }` | Resource         |                             |
| `getResource(userId, resourceId)`      | —                                                                  | Resource \| null |                             |
| `getResourcesByAgent(userId, agentId)` | —                                                                  | Resource[]       | Ordered by createdAt ASC    |
| `deleteResource(userId, resourceId)`   | —                                                                  | number           | Cascading: destroys vectors |

#### Vector Methods

| Method                                                | Parameters                                                | Returns  | Notes                                            |
| ----------------------------------------------------- | --------------------------------------------------------- | -------- | ------------------------------------------------ |
| `addVectors(userId, conversationId, vectors)`         | `[{ content, embedding?, resourceID?, toolID?, order? }]` | Vector[] | Bulk create. Order defaults to array index.      |
| `getVectorsByConversation(userId, conversationId)`    | —                                                         | Vector[] | Ordered by order ASC                             |
| `getVectorsByResource(userId, resourceId)`            | —                                                         | Vector[] | Ordered by order ASC                             |
| `searchVectors(params)`                               | `{ toolID?, conversationID?, embedding?, topN? }`         | Vector[] | Cosine similarity search when embedding provided |
| `deleteVectorsByConversation(userId, conversationId)` | —                                                         | number   |                                                  |

### Ownership Model

All operations enforce user ownership via `WHERE userID = :userId`. Exceptions:

- `getAgent` and `getAgents` also return global agents where `userID IS NULL`
- Global agents cannot be modified or deleted through user endpoints (returns `403`)
- Tool and Prompt methods are not user-scoped (they use IDs directly)

## Configuration

| Variable       | Required | Default | Description                                        |
| -------------- | -------- | ------- | -------------------------------------------------- |
| `PORT`         | No       | 3002    | Service port                                       |
| `DB_STORAGE`   | No       | —       | PGlite data directory (uses embedded PG when set)  |
| `DB_SKIP_SYNC` | No       | false   | Skip schema sync (set `true` in microservice mode) |
| `PGHOST`       | Prod     | —       | PostgreSQL host                                    |
| `PGPORT`       | Prod     | —       | PostgreSQL port                                    |
| `PGDATABASE`   | Prod     | —       | PostgreSQL database name                           |
| `PGUSER`       | Prod     | —       | PostgreSQL user                                    |
| `PGPASSWORD`   | Prod     | —       | PostgreSQL password                                |

## Data Ownership

| Operation               | Models                                                                            |
| ----------------------- | --------------------------------------------------------------------------------- |
| **Owns (reads/writes)** | Agent, Conversation, Message, Resource, Vector, Tool, Prompt, AgentTool, UserTool |
| **Reads**               | Prompt (for agent resolution)                                                     |

## Client Integration

The server connects to CMS via `server/services/clients/cms.js`, a factory-pattern client:

- **Direct mode** (no `CMS_URL`): Instantiates `ConversationService` and calls methods directly.
- **HTTP mode** (`CMS_URL` set): Makes HTTP requests with `X-User-Id` header.

```js
import { createConversation, addMessage, getMessages } from "./services/clients/cms.js";

const conversation = await createConversation(userId, { title: "New Chat", agentID: 1 });
await addMessage(userId, conversation.id, { role: "user", content: [{ text: "Hello" }] });
const messages = await getMessages(userId, conversation.id);
```
