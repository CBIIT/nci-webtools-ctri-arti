# Server Services Spec

Core services that support the API layer. Located in `server/services/`.

## Database (`database.js`)

Sequelize ORM wrapper. Supports PostgreSQL (production) and SQLite (testing).

### Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `DB_DIALECT` | `postgres` | Database dialect: `postgres` or `sqlite` |
| `DB_STORAGE` | `:memory:` | SQLite storage path (only for sqlite dialect) |
| `DB_SKIP_SYNC` | `false` | Skip schema sync/seed (for microservices that don't manage schema) |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | — | PostgreSQL connection |

### Initialization

1. Creates Sequelize instance with selected dialect
2. Calls `createModels(db)` to define all models and associations
3. If `DB_SKIP_SYNC !== "true"`: syncs schema and seeds data
   - SQLite: `sync({ force: false })`
   - PostgreSQL: `sync({ alter: true })`
4. Runs `seedDatabase(models)` to upsert seed data

### Exports

Named model exports: `User`, `Role`, `Provider`, `Model`, `Usage`, `Prompt`, `Agent`, `Thread`, `Message`, `Resource`, `Vector`

Default export: Sequelize instance (`db`)

---

## Schema (`schema.js`)

Database model definitions, associations, and seed data loading.

### Model Definitions

| Model | Key Attributes | Indexes |
|-------|----------------|---------|
| **User** | email, firstName, lastName, status, roleId, apiKey, limit, remaining | email, roleId |
| **Role** | name, policy (JSON), order | order |
| **Provider** | name, apiKey, endpoint | — |
| **Model** | providerId, name, internalName, maxContext, maxOutput, maxReasoning, cost1kInput, cost1kOutput, cost1kCacheRead, cost1kCacheWrite | internalName, providerId |
| **Usage** | userId, modelId, ip, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cost | userId, modelId, createdAt, (userId+createdAt) |
| **Prompt** | name, version, content (TEXT) | name, (name+version unique) |
| **Agent** | userId, modelId, name, promptId, tools (JSON) | userId, modelId, promptId |
| **Thread** | agentId, name, summary (TEXT) | agentId, (userId+createdAt) |
| **Message** | userId, threadId, role, content (JSON) | userId, threadId, (threadId+createdAt) |
| **Resource** | userId, agentId, threadId, messageId, name, type, content (TEXT), s3Uri, metadata (JSON) | userId, agentId, threadId |
| **Vector** | userId, threadId, agentId, resourceId, order, text (TEXT), embedding (JSON) | userId, threadId, agentId, (resourceId+order) |

### Associations

```
User → Role (belongsTo)
Model → Provider (belongsTo)
Usage → User, Model (belongsTo)
User, Model → Usage (hasMany)
Agent → Prompt, User (belongsTo)
Prompt, User → Agent (hasMany)
Thread → User, Agent (belongsTo)
Agent → Thread (hasMany)
Message → User, Thread (belongsTo)
User, Thread → Message (hasMany)
Resource → User, Thread, Message (belongsTo)
User → Resource (hasMany)
Vector → User, Thread, Resource (belongsTo)
User, Thread → Vector (hasMany)
```

### Seed Data

Loaded from CSV files in `server/data/` via `csv-loader.js`:

| File | Records | Notes |
|------|---------|-------|
| `roles.csv` | 3 | admin, super user, user |
| `providers.csv` | 3 | bedrock, google (apiKey via env:GEMINI_API_KEY), mock |
| `models.csv` | 9 | Claude Opus/Sonnet/Haiku, Llama Maverick/Scout, Gemini Pro/Flash, Mock |
| `prompts.csv` | 3 | References `file:prompts/ada.txt`, `fedpulse.txt`, `eagle.txt` |
| `agents.csv` | 3 | Standard Chat, FedPulse, EAGLE (all global: userId=null) |

Test admin user created when `TEST_API_KEY` is set.

### Exports

- `modelDefinitions` — Raw model definition objects
- `associations` — Association configuration array
- `createModels(sequelize)` — Creates and associates all models
- `seedDatabase(models)` — Loads CSVs and upserts seed data

---

## CSV Loader (`csv-loader.js`)

Generic CSV parser for loading seed data and configuration from files.

### Exports

| Function | Description |
|----------|-------------|
| `parseCsv(content, options)` | Parse CSV string to array of objects |
| `loadCsv(filePath, options)` | Load and parse a CSV file |

### Features

| Feature | Syntax | Example |
|---------|--------|---------|
| Quoted fields | `"value with, commas"` | `"[{""key"":""val""}]"` |
| Null values | `null` | `null` → `null` |
| File references | `file:relative/path` | `file:prompts/ada.txt` → file contents |
| Environment variables | `env:VAR_NAME` | `env:GEMINI_API_KEY` → process.env value |
| JSON auto-detection | Values starting with `[` or `{` | `[""a"",""b""]` → `["a","b"]` |
| Numeric auto-casting | Numeric strings | `0.005` → `0.005` |

File references are resolved relative to the CSV file's directory.

---

## Middleware (`middleware.js`)

Authentication, logging, and session management middleware.

### Exports

| Function | Description |
|----------|-------------|
| `logRequests(formatter?)` | Request logging middleware. Default: logs path. |
| `logErrors(formatter?)` | Error handling middleware. Sends email reports if `EMAIL_DEV` set. |
| `nocache` | Sets no-cache headers on all responses. |
| `loginMiddleware` | OIDC login flow with PKCE. |
| `oauthMiddleware()` | Local OIDC provider for dev/testing. |
| `requireRole(roleName?)` | Auth middleware. Session or API key. Optional role check. |
| `WHITELIST` | Re-exported from proxy.js |
| `proxyMiddleware` | Re-exported from proxy.js |
| `getAuthorizedUrl` | Re-exported from proxy.js |
| `getAuthorizedHeaders` | Re-exported from proxy.js |

### requireRole(roleName?)

1. Checks for `X-API-Key` header or `session.user.id`
2. Looks up user with Role include
3. If `roleName` specified: checks `role.name === roleName` or `role.id === roleName` (admin bypasses)
4. Sets `req.session.user` for downstream handlers

Returns 401 if no auth, 403 if wrong role.

---

## Proxy (`proxy.js`)

CORS proxy for fetching external web content.

### Exports

| Function | Description |
|----------|-------------|
| `proxyMiddleware(req, res, next)` | Express middleware for proxying requests |
| `getAuthorizedUrl(url, env?)` | Add API keys to URL for authorized domains |
| `getAuthorizedHeaders(url, env?)` | Add auth headers for authorized domains |
| `WHITELIST` | Array of regex patterns for allowed hostnames |

### Authorized Domains

| Domain | Auth Type | Env Variable |
|--------|-----------|-------------|
| `api.govinfo.gov` | URL param `api_key` | `DATA_GOV_API_KEY` |
| `api.congress.gov` | URL param `api_key` | `CONGRESS_GOV_API_KEY` |
| `api.search.brave.com` | Header `x-subscription-token` | `BRAVE_SEARCH_API_KEY` |

### Request Flow

1. Extract URL from path (strip `/browse/` prefix)
2. Add `https://` if no protocol
3. Append query parameters from original request
4. Validate against WHITELIST
5. Remove problematic headers (`host`, `connection`, `content-length`)
6. Add authorized headers/params for known domains
7. Fetch and stream response back

---

## Utilities (`utils.js`)

Shared utility functions used across the server.

### Exports

| Function | Description |
|----------|-------------|
| `log(value)` | Pretty-print with colors via `util.inspect` |
| `braveSearch(opts, apiKey?)` | Brave web + news search |
| `govSearch(opts, key?)` | GovInfo API search |
| `search(opts)` | Combined Brave + GovInfo search |
| `retry(fn, maxAttempts?, initialDelay?)` | Retry with exponential backoff + jitter |
| `createCertificate(opts?)` | Generate self-signed TLS certificate |
| `getDateRange(startDate?, endDate?)` | Parse date range with defaults (last 30 days) |
| `routeHandler(fn)` | Wrap async route handler with error forwarding |
| `createHttpError(statusCode, error, userMessage)` | Create error with status code and user message |

### routeHandler(fn)

Wraps an async Express handler so rejected promises are forwarded to `next()`:

```js
// Before
api.get("/foo", async (req, res, next) => {
  try { ... } catch (e) { next(e); }
});

// After
api.get("/foo", routeHandler(async (req, res) => { ... }));
```

---

## Scheduler (`scheduler.js`)

Weekly usage limit reset via cron.

### Exports

| Function | Description |
|----------|-------------|
| `resetUsageLimits()` | Sets `remaining = limit` for all users with non-null limits |
| `startScheduler()` | Starts cron job on `USAGE_RESET_SCHEDULE` (default: Sunday midnight) |

### Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `USAGE_RESET_SCHEDULE` | `0 0 * * 0` | Cron expression for reset schedule |

---

## CMS Client (`clients/cms.js`)

Factory-pattern client for conversation management. See `cms/spec.md` for full API details.

Resolved at module load time based on `CMS_URL`:
- **Direct mode** (no CMS_URL): Instantiates `ConversationService` and calls methods directly
- **HTTP mode** (CMS_URL set): Makes HTTP requests with `X-User-Id` header

Exports all 23 conversation methods as named exports and as `cmsClient` object.

---

## Gateway Client (`clients/gateway.js`)

Factory-pattern client for AI inference. See `gateway/spec.md` for full API details.

Resolved at module load time based on `GATEWAY_URL`:
- **Direct mode** (no GATEWAY_URL): Calls `runModel()` directly with rate limiting and usage tracking
- **HTTP mode** (GATEWAY_URL set): POSTs to gateway service API

Exports `infer` and `listModels`.
