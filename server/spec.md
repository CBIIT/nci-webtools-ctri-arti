# Server Spec

Express.js backend for the Research Optimizer platform. Supports monolith deployment (single process) or microservice deployment (3 services).

## Architecture

```
┌─────────────────────────────────────────────────┐
│  server.js (port 8080)                          │
│  ┌───────────────────────────────────────────┐  │
│  │ /api                                      │  │
│  │  ├── auth.js      (login, session)        │  │
│  │  ├── model.js     (AI inference)   ───────│──│──► Gateway Client
│  │  ├── tools.js     (search, browse, data)  │  │
│  │  ├── conversations.js (CRUD)       ───────│──│──► CMS Client
│  │  └── admin.js     (users, analytics)      │  │
│  └───────────────────────────────────────────┘  │
│  /static  (client files)                        │
└─────────────────────────────────────────────────┘
         │                        │
    ┌────▼────┐            ┌──────▼──────┐
    │ gateway │            │     cms     │
    │ :3001   │            │    :3002    │
    │ /api/   │            │    /api/    │
    │  infer  │            │   agents    │
    │  models │            │   threads   │
    └─────────┘            │   messages  │
                           │   resources │
                           │   vectors   │
                           └─────────────┘
```

### Deployment Modes

**Monolith** (default): All services run in a single process. CMS and Gateway clients call service functions directly.

**Microservice**: Set `CMS_URL` and/or `GATEWAY_URL` to route requests over HTTP to separate service processes.

## Entry Points

| File | Port | Purpose |
|------|------|---------|
| `server.js` | 8080 | Main application server. Serves API + static client files. |
| `gateway.js` | 3001 | AI inference microservice (optional). |
| `cms.js` | 3002 | Conversation management microservice (optional). |

## server.js

### createApp(env)

Creates Express application with:
1. Trust proxy enabled
2. `x-powered-by` header disabled
3. `nocache` middleware on all requests
4. Session middleware (Sequelize-backed store, rolling expiry)
5. API routes mounted at `/api`
6. Static file serving for client
7. SPA fallback (all unmatched routes serve `index.html`)

### createServer(app, env)

Creates HTTP or HTTPS server:
- HTTPS if port is 443 or `HTTPS_KEY`/`HTTPS_CERT` provided
- Auto-generates self-signed certificate if HTTPS requested without key/cert

### Session Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| `maxAge` | 30 min (configurable via `SESSION_MAX_AGE`) | Session cookie lifetime |
| `rolling` | true | Resets expiry on each request |
| `resave` | false | Don't save unchanged sessions |
| `saveUninitialized` | false | Don't create empty sessions |
| `store` | SequelizeStore | Database-backed sessions |

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `SESSION_SECRET` | Cookie signing secret |
| `AWS_ACCESS_KEY_ID` | AWS credentials for Bedrock, S3, Textract, Translate |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `PGHOST`, `PGUSER`, `PGPASSWORD` | PostgreSQL connection (production) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server port |
| `DB_DIALECT` | postgres | `postgres` or `sqlite` |
| `DB_STORAGE` | :memory: | SQLite file path |
| `DB_SKIP_SYNC` | false | Skip schema sync (for microservices) |
| `CLIENT_FOLDER` | ../client | Path to static client files |
| `HTTPS_KEY`, `HTTPS_CERT` | — | TLS key/cert (auto-generated if missing) |
| `SESSION_MAX_AGE` | 1800000 | Session TTL in ms (30 min) |
| `SESSION_TTL_POLL_MS` | 10000 | Client polling interval for session TTL |
| `OAUTH_PROVIDER_ENABLED` | — | Enable local OIDC provider for dev |
| `OAUTH_DISCOVERY_URL` | — | OIDC discovery URL |
| `OAUTH_CLIENT_ID` | — | OIDC client ID |
| `OAUTH_CLIENT_SECRET` | — | OIDC client secret |
| `OAUTH_CALLBACK_URL` | — | OIDC redirect URI |
| `GATEWAY_URL` | — | Gateway microservice URL (enables HTTP mode) |
| `CMS_URL` | — | CMS microservice URL (enables HTTP mode) |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `BRAVE_SEARCH_API_KEY` | — | Brave Search API key |
| `DATA_GOV_API_KEY` | — | GovInfo API key |
| `CONGRESS_GOV_API_KEY` | — | Congress.gov API key |
| `S3_BUCKETS` | — | Comma-separated allowed S3 buckets for /api/data |
| `TEST_API_KEY` | — | Creates test admin user with this API key |
| `EMAIL_DEV` | — | Developer error report email |
| `EMAIL_ADMIN` | — | Admin notification email |
| `EMAIL_USER_REPORTS` | — | User feedback email |
| `USAGE_RESET_SCHEDULE` | 0 0 * * 0 | Cron expression for weekly limit reset |
| `VERSION` | — | Reported by /api/status |

## Data Model

See `services/spec.md` for full model definitions and associations.

### Key Relationships

- **User** has a **Role**, many **Usages**, **Agents**, **Threads**, **Messages**, **Resources**, **Vectors**
- **Agent** belongs to a **User** (or null for global) and a **Prompt**
- **Thread** belongs to a **User** and an **Agent**
- **Message** belongs to a **User** and a **Thread**
- **Resource** belongs to a **User**, **Thread**, and **Message**
- **Vector** belongs to a **User**, **Thread**, and **Resource**

### Seed Data

Loaded from `server/data/*.csv` on startup. See `services/spec.md` Schema section.

## Authentication

Three methods:
1. **Session** — OAuth/OIDC login flow sets `session.user`
2. **API Key** — `X-API-Key` header looked up in User table
3. **Internal** — `X-User-Id` header for microservice communication

## Error Handling

- Route handlers use `routeHandler()` wrapper for automatic error forwarding
- `logErrors()` middleware catches all errors, logs them, optionally emails dev team
- Errors include `statusCode` (HTTP status) and user-friendly `message`
- Original error preserved in `additionalError`

## Testing

```bash
npm test                 # Unit tests (Node.js test runner, TAP output)
npm run test:integration # Integration tests (Playwright browser + API)
```

Tests use real services (AWS Bedrock, PostgreSQL/SQLite). No mocking.
