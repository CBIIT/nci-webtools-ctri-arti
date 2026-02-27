# server

Edge server — HTTPS termination, authentication, static file serving, and API routing to internal services.

## Overview

The main application server. Serves the client SPA, handles OAuth/OIDC authentication, and proxies API requests to the gateway (inference) and CMS (conversations) services. Supports monolith deployment (all services in-process) or microservice deployment (services as separate processes).

## Quick Start

```bash
cd server
npm install
cp .env.example .env   # Configure environment
npm run start:dev      # Watch mode with auto-restart
npm test               # Run Jest test suite
npm run test:integration  # Full integration tests with browser
```

## API Reference

All endpoints are mounted under `/api`. See [openapi.yaml](openapi.yaml) for full schemas.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/login` | OIDC middleware | Initiate OAuth login, redirect to provider |
| GET | `/logout` | None | Destroy session, redirect |
| GET | `/session` | None | Get current session info (user + expiry) |
| GET | `/session-ttl` | None | Get session TTL in seconds |
| GET | `/config` | None | Client configuration (sessionTtlPollMs) |

### Model Inference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/model` | `requireRole()` | AI inference (streaming/non-streaming) |
| GET | `/model/list` | `requireRole()` | List available models |

### Tools

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/status` | None | Health check |
| GET | `/search` | `requireRole()` | Web search (Brave + GovInfo) |
| ALL | `/browse/*url` | `requireRole()` | CORS proxy for external URLs |
| POST | `/textract` | `requireRole()` | AWS Textract document extraction |
| POST | `/translate` | `requireRole()` | AWS Translate |
| GET | `/translate/languages` | `requireRole()` | List supported languages |
| POST | `/feedback` | `requireRole()` | Send user feedback email |
| POST | `/log` | None | Send error/log report email |
| GET | `/data` | `requireRole()` | S3 file access with auto-parsing |

### Conversations

| Resource | Endpoints | Auth |
|----------|-----------|------|
| Agents | `POST`, `GET`, `GET /:id`, `PUT /:id`, `DELETE /:id` | `requireRole()` |
| Conversations | `POST`, `GET`, `GET /:id`, `PUT /:id`, `DELETE /:id` | `requireRole()` |
| Context | `GET /conversations/:id/context` | `requireRole()` |
| Compress | `POST /conversations/:id/compress` | `requireRole()` |
| Messages | `POST`, `GET`, `PUT /:id`, `DELETE /:id` | `requireRole()` |
| Resources | `POST`, `GET /:id`, `GET` by agent, `DELETE /:id` | `requireRole()` |
| Vectors | `POST`, `GET` by conversation | `requireRole()` |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/users` | admin | List users with search/sort/pagination |
| GET | `/admin/users/:id` | admin | Get user by ID |
| POST | `/admin/users` | admin | Create or update user |
| DELETE | `/admin/users/:id` | admin | Delete user |
| POST | `/admin/profile` | `requireRole()` | Update own profile |
| GET | `/admin/roles` | admin | List all roles |
| GET | `/admin/users/:id/usage` | admin | Get user's usage history |
| GET | `/admin/usage` | admin | Get all usage records |
| POST | `/admin/usage/reset` | admin | Reset all weekly budgets |
| POST | `/admin/users/:id/reset-limit` | admin | Reset single user's budget |
| GET | `/admin/analytics` | admin | Aggregated usage analytics |

## Architecture

```
┌──────────────────────────────────────────────────┐
│  server.js (port 443/8080)                       │
│  ┌────────────────────────────────────────────┐  │
│  │ /api                                       │  │
│  │  ├── auth.js      (login, session)         │  │
│  │  ├── model.js     → Gateway Client ────────│──│──► Gateway (:3001)
│  │  ├── tools.js     (search, browse, data)   │  │
│  │  ├── conversations.js → CMS Client ────────│──│──► CMS (:3002)
│  │  └── admin.js     (users, analytics)       │  │
│  └────────────────────────────────────────────┘  │
│  /static  (client files)                         │
└──────────────────────────────────────────────────┘
```

### Deployment Modes

**Monolith** (default): All services run in a single process. Gateway and CMS clients call service functions directly via `import`.

**Microservice**: Set `GATEWAY_URL` and/or `CMS_URL` environment variables to route requests over HTTP to separate service processes.

### Factory Clients

Both service clients use a factory pattern resolved at module load time:

**`services/clients/gateway.js`** — Exports `invoke()` and `listModels()`.
- Direct mode: calls `runModel()` from `gateway/inference.js`, handles rate limiting and usage tracking locally.
- HTTP mode: POSTs to `GATEWAY_URL/api/v1/model/invoke`, parses newline-delimited JSON streaming.

**`services/clients/cms.js`** — Exports 30+ conversation methods (`createAgent`, `createConversation`, `addMessage`, `createTool`, `createPrompt`, etc.).
- Direct mode: instantiates `ConversationService` from `cms/conversation.js`.
- HTTP mode: makes HTTP requests with `X-User-Id` header to `CMS_URL/api/v1/...`.

### Authentication

Three methods:
1. **Session** — OAuth/OIDC login sets `session.user`. First user gets admin role; subsequent users get user role with `budget=5`.
2. **API Key** — `X-API-Key` header looked up in User table. Generates `rsk_...` format keys.
3. **Internal** — `X-User-Id` header for microservice communication (used by CMS).

### Error Handling

- Route handlers use `routeHandler()` wrapper for automatic error forwarding
- `logErrors()` middleware catches all errors, logs them, optionally emails dev team (when `EMAIL_DEV` set)
- Errors include `statusCode` (HTTP status) and user-friendly `message`

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 8080 | Server port |
| `SESSION_SECRET` | Yes | — | Cookie signing secret |
| `AWS_ACCESS_KEY_ID` | Yes | — | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | Yes | — | AWS credentials |
| `DB_DIALECT` | No | postgres | `postgres` or `sqlite` |
| `DB_STORAGE` | No | :memory: | SQLite file path |
| `CLIENT_FOLDER` | No | ../client | Path to static client files |
| `HTTPS_KEY`, `HTTPS_CERT` | No | auto-generated | TLS key/cert |
| `SESSION_MAX_AGE` | No | 1800000 | Session TTL in ms (30 min) |
| `SESSION_TTL_POLL_MS` | No | 10000 | Client polling interval for session TTL |
| `OAUTH_PROVIDER_ENABLED` | No | — | Enable local OIDC provider for dev |
| `OAUTH_DISCOVERY_URL` | No | — | OIDC discovery URL |
| `OAUTH_CLIENT_ID` | No | — | OIDC client ID |
| `OAUTH_CLIENT_SECRET` | No | — | OIDC client secret |
| `OAUTH_CALLBACK_URL` | No | — | OIDC redirect URI |
| `GATEWAY_URL` | No | — | Gateway service URL (enables HTTP mode) |
| `CMS_URL` | No | — | CMS service URL (enables HTTP mode) |
| `GEMINI_API_KEY` | No | — | Google Gemini API key |
| `BRAVE_SEARCH_API_KEY` | No | — | Brave Search API key |
| `DATA_GOV_API_KEY` | No | — | GovInfo API key |
| `CONGRESS_GOV_API_KEY` | No | — | Congress.gov API key |
| `S3_BUCKETS` | No | — | Comma-separated allowed S3 buckets |
| `TEST_API_KEY` | No | — | Creates test admin user with this API key |
| `EMAIL_DEV` | No | — | Developer error report email |
| `EMAIL_ADMIN` | No | — | Admin notification email |
| `EMAIL_USER_REPORTS` | No | — | User feedback email |
| `USAGE_RESET_SCHEDULE` | No | `0 0 * * 0` | Cron expression for weekly limit reset |
| `VERSION` | No | — | Reported by `/api/status` |

## Testing

```bash
npm test                 # Unit tests (Jest)
npm run test:integration # Integration tests (Playwright browser + API)
```

Tests use real services (AWS Bedrock, PostgreSQL/SQLite). No mocking.
