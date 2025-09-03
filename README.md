# Research Optimizer

AI research platform for biomedical and regulatory information analysis. Built with buildless SolidJS frontend and Express.js backend with multi-provider AI integration.

## Quick Start

```bash
# Start full development environment (Docker)
docker compose up --build -w

# Run tests
cd server && npm test           # Runs both backend and client e2e/integration tests
```

**Access**: https://localhost (ignore cert warnings for dev)  
**Important**: Client must be served through server (needs HTTPS, OAuth, API proxy)

## Architecture Overview

| Component | Technology | Key Features |
|-----------|------------|--------------|
| **Frontend** | Buildless SolidJS, CDN deps | Chat interface, custom test framework, client-side ML |
| **Backend** | Express.js, PostgreSQL | Multi-provider AI, research tools, authentication |
| **Infrastructure** | AWS CDK | Container deployment |

## Development Guide

### Frontend (Client)

**Key Gotcha**: Buildless SolidJS - no webpack/vite, dependencies via CDN import maps. Test via integration tests: `npm run test:integration`

| What | Where | Notes |
|------|-------|-------|
| **Chat Interface** | `pages/tools/chat/` | Main app feature with streaming AI |
| **Custom Tests** | `test/index.js` | Jest-like framework, runs in real browser |
| **Dependencies** | `index.html` | Import maps point to CDN, no npm install |
| **Components** | `components/` | Use `html` tagged templates, not JSX |

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
cp .env.example .env            # Configure environment
npm run start:dev              # Watch mode
npm test                        # Jest test suite
```

### Environment Setup

Essential `.env` variables:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - For AI models
- `PGHOST`, `PGUSER`, `PGPASSWORD` - Database connection
- `SESSION_SECRET` - Cookie signing
- `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` - Authentication

## Detailed Documentation

For comprehensive guides and API references:

- **[`client/README.md`](client/README.md)** - SolidJS development patterns, component guide, test framework details
- **[`server/README.md`](server/README.md)** - API documentation, database models, provider integration
- **[`infrastructure/`](infrastructure/)** - AWS CDK deployment configuration