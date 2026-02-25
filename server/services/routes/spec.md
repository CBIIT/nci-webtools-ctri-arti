# Routes Spec

All routes are mounted under `/api` via `server/services/api.js`. Every route file exports a default Express `Router`. The API router applies `json({ limit: 1GB })`, `logRequests()`, and `logErrors()` globally.

## Authentication (`auth.js`)

Handles OpenID Connect login, session management, and client configuration.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/login` | loginMiddleware | OIDC login with PKCE. Creates user on first login (first user gets admin role). Redirects to `?destination` or `/`. |
| GET | `/logout` | None | Destroys session, redirects to `?destination` or `/`. |
| GET | `/session` | None | Returns `{ user, expires }`. Touches session (rolling expiry). Refreshes user from DB if logged in. |
| GET | `/session-ttl` | None | Returns `{ ttl }` in seconds. Returns `{ ttl: null, error }` if no session. |
| GET | `/config` | None | Returns `{ sessionTtlPollMs }` (default 10000ms). |

### Login Flow

1. Client navigates to `/api/login?destination=/chat`
2. Server generates PKCE challenge, state, nonce; redirects to OIDC provider
3. Provider redirects back with `?code=...`
4. Server exchanges code for tokens, fetches userinfo
5. If user doesn't exist, creates one (first user = admin, subsequent = user role with limit=5)
6. Sets `session.user`, redirects to destination

### Local OAuth Provider

When `OAUTH_PROVIDER_ENABLED=true`, mounts a local OIDC provider at `/api/oauth` for development/testing. Uses `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` from environment.

---

## AI Model Inference (`model.js`)

Proxies AI inference requests through the gateway client.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/model` | requireRole() | Main inference endpoint. Supports streaming and non-streaming. |
| GET | `/model/list` | requireRole() | List available models. |

### POST /model

**Request Body:**
```json
{
  "model": "us.anthropic.claude-opus-4-6-v1",
  "messages": [
    { "role": "user", "content": [{ "text": "Hello" }] }
  ],
  "system": "You are a helpful assistant.",
  "tools": [],
  "thoughtBudget": 0,
  "stream": true
}
```

**Non-streaming Response:** Full JSON response with `content`, `usage`, `stopReason`.

**Streaming Response:** Newline-delimited JSON. Each line is a separate message object. Connection closes when stream ends. The last message contains `metadata.usage` for token tracking.

**Rate Limiting:** Returns `429` with `{ error: "..." }` when user's `remaining` balance is depleted. Resets weekly (default: Sunday midnight).

### GET /model/list

**Response:**
```json
[
  {
    "name": "Opus 4.6",
    "internalName": "us.anthropic.claude-opus-4-6-v1",
    "maxContext": 200000,
    "maxOutput": 64000,
    "maxReasoning": 60000
  }
]
```

---

## Tools & Utilities (`tools.js`)

Search, browsing proxy, document extraction, translation, feedback, and S3 data access.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/status` | None | Health check: `{ version, uptime, database: { health: 'ok' } }` |
| GET | `/search` | requireRole() | Web search via Brave + GovInfo APIs. Query params forwarded. |
| ALL | `/browse/*url` | requireRole() | CORS proxy. See Proxy section below. |
| POST | `/textract` | requireRole() | AWS Textract document extraction. Body: `{ document, contentType }` |
| POST | `/translate` | requireRole() | AWS Translate. Body: `{ text, sourceLanguage, targetLanguage }` |
| GET | `/translate/languages` | requireRole() | List supported translation languages. |
| POST | `/feedback` | requireRole() | Send user feedback email. Body: `{ feedback, context }` |
| POST | `/log` | None | Send log/error report email. Body: `{ metadata, reportSource }` |
| GET | `/data` | requireRole() | S3 file access. Query: `?bucket=name&key=path&raw=true` |

### GET /search

Runs parallel searches across Brave Web, Brave News, and GovInfo. Returns combined results:
```json
{
  "web": { "results": [...] },
  "news": { "results": [...] },
  "summary": { ... },
  "gov": { "results": [...] }
}
```

### ALL /browse/*url

CORS proxy that forwards requests to external URLs. The URL is extracted from the path after `/browse/`. Features:
- Strips `host`, `connection`, `content-length` headers
- Adds API keys for `api.govinfo.gov` and `api.congress.gov`
- Adds auth tokens for `api.search.brave.com`
- Streams response body back to client
- Whitelist: all hosts allowed by default (`/.*/i`)

### GET /data

S3 bucket access with document parsing:
- Validates bucket against `S3_BUCKETS` whitelist
- If `key` ends with `/` or is missing: lists files in bucket
- If `raw=true`: pipes raw binary content
- PDFs and DOCX files: automatically parsed to text
- Other files: piped as-is

---

## Conversations (`conversations.js`)

CRUD operations for agents, threads, messages, resources, and vectors. All operations are scoped to the authenticated user via `req.session.user.id`. Delegates to the CMS client (direct or HTTP mode).

### Endpoints

#### Agents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/agents` | requireRole() | Create agent. Body: `{ name, promptId?, tools? }`. Returns 201. |
| GET | `/agents` | requireRole() | List user's agents + global agents (userId=null). |
| GET | `/agents/:id` | requireRole() | Get agent by ID. Includes resolved `systemPrompt` from Prompt. |
| PUT | `/agents/:id` | requireRole() | Update agent. Returns 403 if agent is global (userId=null). |
| DELETE | `/agents/:id` | requireRole() | Delete agent. Cascades to threads, messages, resources, vectors. |

#### Threads

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/threads` | requireRole() | Create thread. Body: `{ name?, agentId? }`. Returns 201. |
| GET | `/threads` | requireRole() | List threads. Query: `?limit=20&offset=0`. Returns `{ data, meta }`. |
| GET | `/threads/:id` | requireRole() | Get thread by ID. |
| PUT | `/threads/:id` | requireRole() | Update thread. Body: `{ name?, summary? }`. |
| DELETE | `/threads/:id` | requireRole() | Delete thread. Cascades to messages, resources, vectors. |

#### Messages

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/threads/:threadId/messages` | requireRole() | Add message. Body: `{ role, content }`. Returns 201. |
| GET | `/threads/:threadId/messages` | requireRole() | Get all messages in thread (ordered by createdAt ASC). |
| PUT | `/messages/:id` | requireRole() | Update message. |
| DELETE | `/messages/:id` | requireRole() | Delete message. |

#### Resources

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/resources` | requireRole() | Create resource. Body: `{ name, type, content, threadId?, s3Uri?, metadata? }`. Returns 201. |
| GET | `/resources/:id` | requireRole() | Get resource by ID. |
| GET | `/threads/:threadId/resources` | requireRole() | List resources for thread (ordered by createdAt ASC). |
| DELETE | `/resources/:id` | requireRole() | Delete resource. Cascades to vectors. |

#### Vectors

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/threads/:threadId/vectors` | requireRole() | Add vectors. Body: `{ vectors: [{ text, embedding?, resourceId?, order? }] }`. Returns 201. |
| GET | `/threads/:threadId/vectors` | requireRole() | Get vectors for thread (ordered by order ASC). |

### Response Formats

**GET /threads** always returns:
```json
{
  "data": [{ "id": 1, "name": "...", "agentId": 1, "createdAt": "..." }],
  "meta": { "total": 42, "limit": 20, "offset": 0 }
}
```

**GET /agents** returns agents with flattened prompt:
```json
{
  "id": 1,
  "name": "Standard Chat",
  "tools": ["search", "browse", "code", "editor", "think"],
  "systemPrompt": "The assistant is Ada...",
  "Prompt": { "id": 1, "name": "ada-system-prompt", "content": "..." }
}
```

---

## Admin (`admin.js`)

User management, usage tracking, and analytics. All admin endpoints require `requireRole("admin")` except `/admin/profile` which requires any authenticated role.

### Endpoints

#### User Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/users` | admin | List users with search/sort/pagination. |
| GET | `/admin/users/:id` | admin | Get user by ID with role. |
| POST | `/admin/users` | admin | Create or update user. |
| DELETE | `/admin/users/:id` | admin | Delete user. |
| POST | `/admin/profile` | requireRole() | Update own profile (firstName, lastName only). |
| GET | `/admin/roles` | admin | List all roles ordered by `order`. |

#### Usage

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/users/:id/usage` | admin | Get usage history for user. |
| GET | `/admin/usage` | admin | Get all usage records. |
| POST | `/admin/usage/reset` | admin | Reset all users' weekly limits. |
| POST | `/admin/users/:id/reset-limit` | admin | Reset single user's limit. |

#### Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/analytics` | admin | Aggregated usage analytics. |

### GET /admin/users

**Query Parameters:**
- `search` — Case-insensitive search across firstName, lastName, email
- `limit` (default 100), `offset` (default 0)
- `sortBy` — `name`, `email`, `status`, `role`, `limit`, `createdAt`
- `sortOrder` — `ASC` or `DESC`

**Response:** `{ data: [User], meta: { total, limit, offset, search, sortBy, sortOrder } }`

### POST /admin/users

**Request Body:**
```json
{
  "id": 1,
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "roleId": 3,
  "limit": 10,
  "generateApiKey": true
}
```

If `id` is provided, updates existing user. If `generateApiKey` is true, generates `rsk_...` API key.

### GET /admin/analytics

**Query Parameters:**
- `startDate`, `endDate` — Date range (default: last 30 days)
- `groupBy` — `hour`, `day`, `week`, `month`, `user`, `model` (default: `day`)
- `userId` — Filter to specific user
- `search` — Search users (only for `groupBy=user`)
- `role`, `status` — Filter users (only for `groupBy=user`)
- `sortBy`, `sortOrder` — Sort (only for `groupBy=user`)
- `limit`, `offset` — Pagination (only for `groupBy=user`)

**Response (time-based groupBy):**
```json
{
  "data": [
    { "period": "2026-02-17", "totalCost": 1.23, "totalInputTokens": 50000, "totalOutputTokens": 25000, "totalRequests": 10, "uniqueUsers": 3 }
  ],
  "meta": { "groupBy": "day" }
}
```

**Response (user groupBy):**
```json
{
  "data": [
    { "userId": 1, "totalCost": 1.23, "totalRequests": 10, "User": { ... } }
  ],
  "meta": { "groupBy": "user", "total": 50, "limit": 100, "offset": 0, ... }
}
```
