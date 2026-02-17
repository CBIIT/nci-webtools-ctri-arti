# CMS Service Spec

The CMS (Conversation Management Service) manages agents, threads, messages, resources, and vectors. It runs either embedded in the main server (monolith mode) or as a standalone microservice on port 3002.

## Entry Point

`server/cms.js` — Standalone Express server that mounts the CMS API router.

## API (`api.js`)

Internal service API. All requests must include an `X-User-Id` header. Returns 400 if missing.

Middleware stack: `json({ limit: 1GB })` → `logRequests()` → userId extraction → routes → `logErrors()`

### Endpoints

Identical to the main server's conversation endpoints (see `routes/spec.md` Conversations section), but authenticated via `X-User-Id` header instead of session/API key.

| Resource | Endpoints | Description |
|----------|-----------|-------------|
| Agents | POST, GET, GET/:id, PUT/:id, DELETE/:id | Agent CRUD |
| Threads | POST, GET, GET/:id, PUT/:id, DELETE/:id | Thread CRUD with pagination |
| Messages | POST, GET, PUT/:id, DELETE/:id | Message CRUD |
| Resources | POST, GET/:id, GET by thread, DELETE/:id | Resource CRUD |
| Vectors | POST, GET by thread | Vector storage |

### GET /threads Response

Always returns normalized format:
```json
{
  "data": [...],
  "meta": { "total": 42, "limit": 20, "offset": 0 }
}
```

## ConversationService (`conversation.js`)

Core business logic class. All methods take `userId` as first parameter for ownership scoping.

### Agent Methods

| Method | Params | Returns | Notes |
|--------|--------|---------|-------|
| `createAgent(userId, data)` | `{ name, promptId?, tools? }` | Agent | Sets userId on creation |
| `getAgent(userId, agentId)` | — | Agent or null | Returns user's OR global agents (userId=null). Includes Prompt. Flattens `Prompt.content` → `systemPrompt`. |
| `getAgents(userId)` | — | Agent[] | User's + global agents, ordered by createdAt DESC |
| `updateAgent(userId, agentId, updates)` | — | Agent or null | Only updates agents owned by userId |
| `deleteAgent(userId, agentId)` | — | number | Cascading: deletes all threads (and their messages/resources/vectors) first |

### Thread Methods

| Method | Params | Returns | Notes |
|--------|--------|---------|-------|
| `createThread(userId, data)` | `{ name?, agentId? }` | Thread | |
| `getThread(userId, threadId)` | — | Thread or null | Scoped to userId |
| `getThreads(userId, options)` | `{ limit?, offset? }` | `{ count, rows }` | Paginated, ordered by createdAt DESC |
| `updateThread(userId, threadId, updates)` | — | Thread or null | |
| `deleteThread(userId, threadId)` | — | number | Cascading: destroys messages, resources, vectors first |

### Message Methods

| Method | Params | Returns | Notes |
|--------|--------|---------|-------|
| `addMessage(userId, threadId, data)` | `{ role, content, agentId? }` | Message | |
| `getMessages(userId, threadId)` | — | Message[] | Ordered by createdAt ASC |
| `getMessage(userId, messageId)` | — | Message or null | |
| `updateMessage(userId, messageId, updates)` | — | Message or null | |
| `deleteMessage(userId, messageId)` | — | number | |

### Resource Methods

| Method | Params | Returns | Notes |
|--------|--------|---------|-------|
| `addResource(userId, data)` | `{ name, type, content, threadId?, s3Uri?, metadata? }` | Resource | |
| `getResource(userId, resourceId)` | — | Resource or null | |
| `getResourcesByThread(userId, threadId)` | — | Resource[] | Ordered by createdAt ASC |
| `deleteResource(userId, resourceId)` | — | number | Cascading: destroys vectors first |

### Vector Methods

| Method | Params | Returns | Notes |
|--------|--------|---------|-------|
| `addVectors(userId, threadId, vectors)` | `[{ text, embedding?, resourceId?, order? }]` | Vector[] | Bulk create. Order defaults to array index. |
| `getVectorsByThread(userId, threadId)` | — | Vector[] | Ordered by order ASC |
| `getVectorsByResource(userId, resourceId)` | — | Vector[] | Ordered by order ASC |
| `deleteVectorsByThread(userId, threadId)` | — | number | |

## Ownership Model

All operations enforce user ownership via `WHERE userId = :userId`. Exception: `getAgent` and `getAgents` also return global agents where `userId IS NULL`. Global agents cannot be modified or deleted through user endpoints.
