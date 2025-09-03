# Research Optimizer

AI research platform for biomedical and regulatory information analysis. Built with buildless SolidJS frontend and Express.js backend with multi-provider AI integration.

## Quick Start

```bash
# Start server
cd server && npm install && npm start

# Optional: Start full development environment (Docker)
docker compose up --build -w

# Run tests
cd server && npm test           # Backend unit tests + full application integration tests
cd server && npm run test:integration  # Integration tests only (full app in browser)
```

**Access**: https://localhost (ignore cert warnings for dev)  
**Important**: Client must be served through server (needs HTTPS, OAuth, API proxy)

## Architecture Overview

| Component | Technology | Key Features |
|-----------|------------|--------------|
| **Frontend** | Buildless SolidJS, CDN deps | Chat interface, local database, client-side embeddings |
| **Backend** | Express.js, PostgreSQL | Multi-provider AI, research tools, authentication |
| **Testing** | Node.js test + Playwright | No mocking, real services, browser testing |
| **Infrastructure** | AWS CDK | Container deployment |

## Testing Philosophy

Real-world testing approach with no mocking:

- All tests use real AWS Bedrock, databases, and API calls
- Client tests run in actual Chromium browser via Playwright
- Custom TAP-compliant test framework for buildless client testing
- `npm test` runs both backend unit tests and integration tests

## Development Guide

### Frontend (Client)

**Key Gotcha**: Buildless SolidJS - no webpack/vite, dependencies via CDN import maps. Test via integration tests: `npm run test:integration`

| What | Where | Notes |
|------|-------|-------|
| **Chat Interface** | `pages/tools/chat/` | Main app feature with streaming AI |
| **Chat Hooks** | `pages/tools/chat/hooks.js` | Core chat functionality and database interactions |
| **Client Database** | `models/database.js` | IndexedDB with vector search for conversation storage |
| **Client Models** | `models/models.js` | Project, Conversation, Message data structures |
| **Embeddings** | `models/embedders.js` | Client-side vector embeddings for search |
| **Components** | `components/` | Use `html` tagged templates, not JSX |
| **Dependencies** | `index.html` | Import maps point to CDN, no npm install |
| **Tests** | `test/` | Custom TAP framework, runs in browser via `?test=1` |

### Backend (Server)

**Key Services:**

| What | Where | Purpose |
|------|-------|---------|
| **AI Integration** | `services/inference.js` | Multi-provider AI with streaming |
| **API Routes** | `services/routes/` | model, tools, auth, admin endpoints |
| **Database** | `services/database.js` | PostgreSQL with Sequelize ORM |
| **Research Tools** | `services/routes/tools.js` | Search, translation, web proxy |

**Key Features:**
- Multi-provider AI (AWS Bedrock, Google Gemini)
- Web browsing proxy for CORS bypass
- OpenID Connect authentication  
- Usage tracking and rate limiting

**Development:**
```bash
cd server
npm install
cp .env.example .env           # Configure environment
npm run start:dev              # Watch mode with auto-restart
```

### Environment Setup

Copy `server/.env.example` to `server/.env` and configure:
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
```

### Testing Guide

| Command | What It Does |
|---------|--------------|
| `cd server && npm test` | Backend unit tests + integration tests |
| `cd server && npm run test:integration` | Integration tests only (full app in browser) |

**Writing Tests:**
```javascript
// Backend (Node.js)
import { test } from 'node:test';
import assert from 'node:assert';

// Client (Browser)  
import test from '../test.js';
import assert from '../assert.js';
```

**Setup:** Tests use `server/test.env`, integration tests start full server with HTTPS, client tests triggered via `?test=1`

## Detailed Documentation

For comprehensive guides and API references:

- **[`client/README.md`](client/README.md)** - SolidJS development patterns, component guide, test framework details
- **[`server/README.md`](server/README.md)** - API documentation, database models, provider integration
- **[`infrastructure/`](infrastructure/)** - AWS CDK deployment configuration