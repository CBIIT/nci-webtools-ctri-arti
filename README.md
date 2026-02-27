# Research Optimizer

AI research platform for biomedical and regulatory information analysis. Features a streaming chat interface with multi-model AI support, document analysis, web search, and privacy-first local conversation storage.

## Architecture

```
Client (SolidJS) ──► Server (:443) ──┬──► Gateway (:3001) ──► AI Providers
                                     ├──► CMS (:3002)           (Bedrock, Gemini)
                                     └──► PostgreSQL (:5432)
```

| Package | Type | Port | Description |
|---------|------|------|-------------|
| [client](client/) | Frontend | — | Buildless SolidJS chat interface with local IndexedDB storage |
| [server](server/) | Service | 443/8080 | Edge server — HTTPS, OAuth, static files, API routing |
| [gateway](gateway/) | Service | 3001 | AI inference — multi-provider abstraction, usage tracking |
| [cms](cms/) | Service | 3002 | Conversation management — agents, threads, messages CRUD |
| [agents](agents/) | Service (stub) | 3003 | Chat orchestration (planned) |
| [users](users/) | Service (stub) | 3004 | Identity and access management (planned) |
| [database](database/) | Library | — | Sequelize models, associations, seed data |
| [shared](shared/) | Library | — | Logger, middleware, utilities |
| [infrastructure](infrastructure/) | CDK | — | AWS deployment (ECR, ECS Fargate, RDS Aurora) |

## Quick Start

```bash
# Start full development environment
docker compose up --build -w

# Access at https://localhost (ignore cert warnings for dev)
```

The client must be served through the server (needs HTTPS, OAuth, API proxy).

## Development Modes

### Docker (recommended)

Runs all services as separate containers with hot reload:

```bash
docker compose up --build -w
```

### Single-Process Monolith

All services run in one process. No `GATEWAY_URL`/`CMS_URL` set — factory clients call service code directly:

```bash
cd server
cp .env.example .env   # Configure with sqlite for easy setup
npm install
npm run start:dev
```

### Multi-Process Microservices

Each service runs separately. Set `GATEWAY_URL` and `CMS_URL` to enable HTTP mode:

```bash
npm start -w gateway   # Port 3001
npm start -w cms       # Port 3002
GATEWAY_URL=http://localhost:3001 CMS_URL=http://localhost:3002 npm start -w server
```

## Environment Variables

Core variables needed across services. See individual service READMEs for complete lists.

| Variable | Services | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | server | Cookie signing secret |
| `AWS_ACCESS_KEY_ID` | server, gateway | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | server, gateway | AWS credentials |
| `GEMINI_API_KEY` | gateway | Google Gemini API key |
| `DB_DIALECT` | all | `postgres` or `sqlite` |
| `DB_SKIP_SYNC` | gateway, cms | Skip schema sync (`true` in microservice mode) |
| `PGHOST`, `PGUSER`, `PGPASSWORD` | all (postgres) | PostgreSQL connection |
| `GATEWAY_URL` | server | Gateway service URL (enables HTTP mode) |
| `CMS_URL` | server | CMS service URL (enables HTTP mode) |
| `OAUTH_CLIENT_ID` | server | OIDC client ID |
| `OAUTH_CLIENT_SECRET` | server | OIDC client secret |
| `BRAVE_SEARCH_API_KEY` | server | Brave Search API key |

## Testing

```bash
cd server && npm test               # Backend unit tests (Jest)
cd server && npm run test:integration  # Full integration tests (Playwright + API)
```

Tests use real services (AWS Bedrock, PostgreSQL/SQLite). No mocking.

## Deployment

Deployed to AWS using CDK. See [infrastructure/](infrastructure/) for details.

```bash
# CI/CD pipeline
./deploy.sh
```

The deploy script builds 3 Docker images (main, gateway, cms), pushes to ECR, and deploys via CDK to ECS Fargate with Aurora Serverless PostgreSQL.

## Project Structure

```
research-optimizer/
├── package.json              # Root workspace config
├── docker-compose.yml        # Multi-service development
├── deploy.sh                 # CI/CD deployment script
├── Dockerfile                # Multi-service container image
│
├── client/                   # Frontend (buildless SolidJS)
│   ├── components/           # Reusable UI components
│   ├── models/               # IndexedDB, embeddings, data models
│   ├── pages/tools/chat/     # Main chat interface
│   └── utils/                # Client utilities
│
├── server/                   # Edge server (HTTPS, auth, routing)
│   ├── server.js             # Entry point
│   ├── services/
│   │   ├── routes/           # API endpoints (auth, model, tools, admin)
│   │   └── clients/          # Factory clients (gateway.js, cms.js)
│   └── openapi.yaml          # Public API spec
│
├── gateway/                  # AI inference service
│   ├── inference.js          # Provider orchestration
│   ├── providers/            # Bedrock, Gemini, Mock
│   ├── usage.js              # Token tracking
│   └── openapi.yaml          # Service API spec
│
├── cms/                      # Conversation management service
│   ├── conversation.js       # ConversationService class
│   ├── api.js                # REST routes
│   └── openapi.yaml          # Service API spec
│
├── agents/                   # Chat orchestration (stub)
├── users/                    # Identity management (stub)
│
├── database/                 # Shared database package
│   ├── schema.js             # Model definitions + associations
│   ├── csv-loader.js         # Seed data parser
│   └── data/                 # Seed CSVs
│
├── shared/                   # Shared utilities
│   ├── logger.js             # Winston logging
│   ├── middleware.js          # Request/error logging, nocache
│   └── utils.js              # routeHandler, createHttpError
│
└── infrastructure/        # AWS CDK deployment
    ├── stacks/               # ECR, ECS, RDS stacks
    └── config.py             # Environment configuration
```

## Documentation Index

| Document | Description |
|----------|-------------|
| [client/readme.md](client/readme.md) | Frontend architecture and components |
| [server/README.md](server/README.md) | Edge server, API reference |
| [server/openapi.yaml](server/openapi.yaml) | Public API spec (OpenAPI 3.1) |
| [gateway/README.md](gateway/README.md) | Inference service architecture |
| [gateway/openapi.yaml](gateway/openapi.yaml) | Gateway API spec (OpenAPI 3.1) |
| [cms/README.md](cms/README.md) | Conversation management service |
| [cms/openapi.yaml](cms/openapi.yaml) | CMS API spec (OpenAPI 3.1) |
| [database/README.md](database/README.md) | Data models, ownership matrix, seed data |
| [shared/README.md](shared/README.md) | Shared library reference |
| [agents/README.md](agents/README.md) | Chat orchestration (stub) |
| [users/README.md](users/README.md) | Identity management (stub) |
| [infrastructure/README.md](infrastructure/README.md) | AWS CDK deployment |
| [CLAUDE.md](CLAUDE.md) | AI assistant guidance for this codebase |
