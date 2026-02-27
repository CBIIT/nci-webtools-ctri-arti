# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Research Optimizer

AI research platform for biomedical and regulatory information analysis. npm workspace monorepo with buildless SolidJS frontend, Express.js microservices backend, and multi-provider AI integration.

## Quick Start

```bash
# Start full development environment
docker compose up --build -w

# Run tests
cd server && npm test           # Backend tests (Jest)
cd server && npm run test:integration  # Integration tests for full application
```

**Access**: https://localhost (ignore cert warnings for dev)
**Important**: Client must be served through server (needs HTTPS, OAuth, API proxy)

## Workspace Structure

This is an npm workspace monorepo. The root `package.json` defines workspaces:

```
research-optimizer/
├── package.json              # Root workspace: shared, database, gateway, cms, agents, users, server
├── shared/                   # Library: logger, middleware, utils
├── database/                 # Library: Sequelize models, schema, seed data
├── gateway/                  # Service (:3001): AI inference, usage tracking
├── cms/                      # Service (:3002): conversation CRUD
├── agents/                   # Service stub (:3003): chat orchestration (planned)
├── users/                    # Service stub (:3004): identity management (planned)
├── server/                   # Service (:443/8080): edge server, auth, static files
├── client/                   # Frontend: buildless SolidJS
└── infrastructure/        # AWS CDK (Python): ECR, ECS, RDS
```

### Workspace Commands

```bash
npm start                      # Start server (default)
npm start -w gateway           # Start gateway service
npm start -w cms               # Start CMS service
npm start -w agents            # Start agents service
npm start -w users             # Start users service
npm test                       # Run server tests
```

## Architecture Overview

```
Client (SolidJS) ──► Server (:443) ──┬──► Gateway (:3001) ──► Bedrock / Gemini
                                     ├──► CMS (:3002)
                                     └──► PostgreSQL (:5432)
```

**Deployment modes:**
- **Monolith** (default): All services in one process. Factory clients call code directly.
- **Microservice**: Set `GATEWAY_URL`/`CMS_URL` — factory clients use HTTP.

**Factory clients** (`server/services/clients/gateway.js`, `server/services/clients/cms.js`): Toggle between direct import and HTTP based on env vars. This is the key abstraction for monolith/microservice switching.

## Testing Philosophy

Real-world testing approach with no mocking:

- All tests use real AWS Bedrock, databases, and API calls
- Client tests run in actual Chromium browser via Playwright
- Custom TAP-compliant test framework for buildless client testing
- `npm test` runs both backend unit tests and integration tests

## Development Guide

### Frontend (Client)

**Key Gotcha**: Buildless SolidJS — no webpack/vite, dependencies via CDN import maps. Test via integration tests.

| What | Where | Notes |
|------|-------|-------|
| **Chat Interface** | `client/pages/tools/chat/` | Main app feature with streaming AI |
| **Chat Hooks** | `client/pages/tools/chat/hooks.js` | Core chat functionality and database interactions |
| **Client Database** | `client/models/database.js` | IndexedDB with vector search for conversation storage |
| **Client Models** | `client/models/models.js` | Project, Conversation, Message data structures |
| **Embeddings** | `client/models/embedders.js` | Client-side vector embeddings for search |
| **Components** | `client/components/` | Use `html` tagged templates, not JSX |
| **Dependencies** | `client/index.html` | Import maps point to CDN, no npm install |
| **Tests** | `client/test/` | Custom TAP framework, runs in browser via `?test=1` |

### Backend Services

| Package | Key Files | Purpose |
|---------|-----------|---------|
| **server** | `server/server.js`, `server/services/routes/` | HTTPS, OAuth, API routing, static files |
| **gateway** | `gateway/inference.js`, `gateway/providers/` | AI inference, cache points, usage tracking |
| **cms** | `cms/conversation.js`, `cms/api.js` | Conversation CRUD, X-User-Id scoping |
| **database** | `database/schema.js`, `database/index.js` | Model definitions, associations, seed data |
| **shared** | `shared/logger.js`, `shared/middleware.js`, `shared/utils.js` | Logging, request/error middleware, routeHandler |

### Key Server Paths

| What | Where | Purpose |
|------|-------|---------|
| **API Routes** | `server/services/routes/` | auth, model, tools, conversations, admin |
| **Factory Clients** | `server/services/clients/` | gateway.js, cms.js — monolith/microservice toggle |
| **Middleware** | `server/services/middleware.js` | Auth (requireRole, loginMiddleware), proxy, email-enhanced logErrors |
| **OpenAPI Specs** | `server/openapi.yaml`, `gateway/openapi.yaml`, `cms/openapi.yaml` | API documentation |

### Key Endpoints

- `POST /api/model` — Main AI inference endpoint with streaming support
- `GET /api/search` — Web search (Brave + GovInfo)
- `ALL /api/browse/*url` — CORS proxy for external URLs
- `POST /api/translate` — AWS Translate
- `GET /api/session` — User session information
- `/api/agents`, `/api/conversations`, `/api/messages` — Conversation CRUD (via CMS client)
- `/api/admin/*` — User management and analytics (admin role)

### Environment Setup

Essential `.env` variables (in `server/.env`):
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — For AWS Bedrock AI models
- `PGHOST`, `PGUSER`, `PGPASSWORD` — Database connection (or use `DB_DIALECT=sqlite`)
- `SESSION_SECRET` — Cookie signing
- `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` — Authentication
- `GEMINI_API_KEY` — For Google Gemini models
- `GATEWAY_URL`, `CMS_URL` — Set these to enable microservice mode

## Common Commands

### Docker Environment

```bash
docker compose up --build -w    # Start all services with hot reload
docker compose build            # Rebuild containers
docker compose logs -f server   # View logs
docker compose down             # Stop all services
```

### Testing

```bash
cd server && npm test               # Backend tests
cd server && npm run test:integration  # Full integration tests with browser
cd server && npm run cert           # Generate SSL certificate
```

### Individual Services

```bash
npm start -w gateway           # Start gateway on :3001
npm start -w cms               # Start CMS on :3002
npm start -w server            # Start server on :443/8080
```

## Key Application Features

1. **AI Chat Interface**: Streaming AI responses with tool use and file uploads
2. **Research Mode**: Extended thinking for complex queries
3. **Document Analysis**: Upload and analyze PDFs, DOCXs, images
4. **FedPulse**: Specialized federal government search
5. **Privacy-First Storage**: Conversations stored locally in browser via IndexedDB
6. **Vector Search**: Client-side semantic search of conversation history
7. **Multi-Model Support**: AWS Bedrock (Claude, Llama) and Google Gemini
8. **Rate Limiting**: Usage tracking and weekly allowances per user
9. **CORS Proxy**: Backend proxy for fetching web content

## Architecture Patterns

- **Buildless Frontend**: ES modules directly via CDN without bundling tools
- **Client-side Database**: IndexedDB with HNSW vector search algorithm
- **Multi-provider AI**: Abstract interface across AI providers (Bedrock, Gemini)
- **HTML Tagged Templates**: SolidJS with HTML literals instead of JSX
- **Factory Client Pattern**: Same interface for in-process calls or HTTP calls
- **Streaming Responses**: Newline-delimited JSON for real-time AI responses
- **Cache Points**: sqrt(2) scaling for strategic token caching in AI requests
- **Workspace Packages**: npm workspaces for shared code (database, shared)
