# Research Optimizer Server

## Overview

This is the server component for the Research Optimizer application - a Node.js Express API server that provides:

1. API endpoints for accessing AI language models and other services
2. Authentication and user management
3. Database access via PostgreSQL with Sequelize ORM
4. Translation services via AWS Translate
5. Proxy services for external data sources
6. Document parsing for various formats
7. Client application serving with HTTPS/SSL support

The server acts as both an API backend and serves the SolidJS client application, providing proper HTTPS support, handling API requests, and implementing correct SPA routing.

## Technology Stack

- **Runtime**: Node.js with ESM modules
- **Framework**: Express.js 5.x
- **Database**: PostgreSQL with pgvector extension
- **ORM**: Sequelize
- **AI Integration**: AWS Bedrock (Claude), Google Gemini
- **Authentication**: OpenID Connect (via openid-client)
- **Translation**: AWS Translate
- **Document Processing**: PDF.js, Mammoth (DOCX)
- **Email**: Nodemailer
- **Security**: Node-forge for certificate generation

## Quick Start

### Local Development
```bash
cd server
npm install
npm run cert      # (Optional) Generate self-signed SSL certificates
npm run start     # Regular start
npm run start:dev # Watch mode for development
```

### Docker (Optional)
```bash
# From project root
docker compose up --build -w
```

## Project Structure

```
server/
├── server.js              # Main server entry point
├── package.json           # Dependencies and scripts
├── services/
│   ├── api.js            # Main API router
│   ├── database.js       # Database models and setup
│   ├── inference.js      # AI model provider abstraction
│   ├── middleware.js     # Authentication, logging, proxy
│   ├── translate.js      # AWS Translate integration
│   ├── email.js          # Email services
│   ├── utils.js          # Utilities, search APIs
│   ├── logger.js         # Winston logging
│   ├── scheduler.js      # Cron jobs
│   ├── parsers.js        # Document parsing
│   ├── routes/
│   │   ├── admin.js      # Admin user management
│   │   ├── auth.js       # Authentication endpoints
│   │   ├── model.js      # AI model endpoints
│   │   └── tools.js      # Search, translate, feedback
│   └── providers/
│       ├── bedrock.js    # AWS Bedrock integration
│       └── gemini.js     # Google Gemini integration
└── .env.example          # Environment variables template
```

## API Endpoints

### Authentication
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/login` | GET | OAuth login flow |
| `/api/logout` | GET | Session termination |
| `/api/session` | GET | Current user session info |

### Admin Routes (require admin role)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/users` | GET | List users with search/pagination |
| `/api/admin/users/:id` | GET | Get specific user |
| `/api/admin/users` | POST | Create/update user |
| `/api/admin/users/:id` | DELETE | Delete user |
| `/api/admin/users/:id/usage` | GET | User usage analytics |
| `/api/admin/roles` | GET | List user roles |
| `/api/admin/usage` | GET | System-wide usage analytics |
| `/api/admin/usage/reset` | POST | Reset usage limits |
| `/api/admin/analytics` | GET | Advanced usage analytics |
| `/api/admin/profile` | POST | Update user profile |

### Model Operations
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/model` | POST | Process AI model requests (streaming/non-streaming) |
| `/api/model/list` | GET | List available models |

### Tools & Services
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/status` | GET | Server health check |
| `/api/search` | GET | Search services (Brave + GovInfo) |
| `/api/browse/*url` | ALL | Proxy external URLs |
| `/api/translate` | POST | AWS Translate service |
| `/api/translate/languages` | GET | Available languages |
| `/api/feedback` | POST | User feedback submission |

## Database Models

### User
| Field | Type | Purpose |
|-------|------|---------|
| email | STRING | User email (unique) |
| firstName | STRING | First name |
| lastName | STRING | Last name |
| status | STRING | Account status |
| roleId | INTEGER | Foreign key to Role |
| apiKey | STRING | API key for model access |
| limit | FLOAT | Usage limit |
| remaining | FLOAT | Remaining usage |

### Role
| Field | Type | Purpose |
|-------|------|---------|
| name | STRING | Role name (admin, super user, user) |
| policy | JSON | Access control policies |
| order | INTEGER | Display order |

### Provider
| Field | Type | Purpose |
|-------|------|---------|
| name | STRING | Provider name (bedrock, google) |
| apiKey | STRING | Provider API key |

### Model
| Field | Type | Purpose |
|-------|------|---------|
| providerId | INTEGER | Foreign key to Provider |
| label | STRING | Display name |
| value | STRING | Model identifier |
| maxContext | INTEGER | Maximum context tokens |
| maxOutput | INTEGER | Maximum output tokens |
| maxReasoning | INTEGER | Maximum reasoning tokens |
| cost1kInput | FLOAT | Cost per 1k input tokens |
| cost1kOutput | FLOAT | Cost per 1k output tokens |
| cost1kCacheRead | FLOAT | Cost per 1k cache read tokens |
| cost1kCacheWrite | FLOAT | Cost per 1k cache write tokens |

### Usage
| Field | Type | Purpose |
|-------|------|---------|
| userId | INTEGER | Foreign key to User |
| modelId | INTEGER | Foreign key to Model |
| ip | STRING | Client IP address |
| inputTokens | FLOAT | Input tokens used |
| outputTokens | FLOAT | Output tokens used |
| cacheReadTokens | FLOAT | Cache read tokens |
| cacheWriteTokens | FLOAT | Cache write tokens |
| cost | FLOAT | Total cost |

## Available AI Models

### AWS Bedrock Models
- **Opus 4.1** - `us.anthropic.claude-opus-4-1-20250805-v1:0`
- **Sonnet 4.0** - `us.anthropic.claude-sonnet-4-20250514-v1:0`
- **Haiku 3.5** - `us.anthropic.claude-3-5-haiku-20241022-v1:0`
- **Maverick** - `us.meta.llama4-maverick-17b-instruct-v1:0`
- **Scout** - `us.meta.llama4-scout-17b-instruct-v1:0`

### Google Models
- **Gemini 2.5 Pro** - `gemini-2.5-pro-preview-06-05`
- **Gemini 2.5 Flash** - `gemini-2.5-flash-preview-04-17`

## Key Services

### Inference Service (`inference.js`)
- `runModel()` - Main model execution with message processing
- `getModelProvider()` - Provider factory pattern
- Supports streaming, tool use, caching, thought budgets

### Translation Service (`translate.js`)
- `translate()` - AWS Translate with formality/profanity settings
- `getLanguages()` - Supported language list

### Document Parsing (`parsers.js`)
- `parseUrl()` - Extract text from URLs
- `parseDocument()` - Parse PDF/DOCX/text from buffers
- `parsePdf()` - PDF.js integration
- `parseDocx()` - Mammoth integration

### Search Integration (`utils.js`)
- `braveSearch()` - Brave Search API (web, news, summary)
- `govSearch()` - Government information API
- `search()` - Combined search wrapper

### Middleware Components (`middleware.js`)
- `loginMiddleware` - Complete OAuth flow implementation
- `requireRole()` - Role-based access control
- `proxyMiddleware` - Secure external API proxy
- `logRequests()` / `logErrors()` - Structured logging

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `8080` | No |
| `VERSION` | Application version | `1.0.0` | No |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Skip SSL verification (dev only) | `0` | No |
| `CLIENT_FOLDER` | Path to client files | `../client` | No |
| `SESSION_SECRET` | Secret for signing cookies | - | **Yes** |
| `SESSION_MAX_AGE` | Session duration in ms | `3600000` | No |
| `PGHOST` | PostgreSQL hostname | `localhost` | No |
| `PGPORT` | PostgreSQL port | `5432` | No |
| `PGDATABASE` | PostgreSQL database name | `postgres` | No |
| `PGUSER` | PostgreSQL username | `postgres` | No |
| `PGPASSWORD` | PostgreSQL password | `postgres` | No |
| `AWS_ACCESS_KEY_ID` | AWS access key | - | **Yes** for AWS services |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | - | **Yes** for AWS services |
| `AWS_SESSION_TOKEN` | AWS session token | - | No |
| `AWS_DEFAULT_REGION` | AWS default region | `us-east-1` | No |
| `AWS_REGION` | AWS region | `us-east-1` | No |
| `HTTPS_KEY` | Path to HTTPS key file | - | No |
| `HTTPS_CERT` | Path to HTTPS certificate | - | No |
| `EMAIL_ADMIN` | Admin email for feedback | - | For feedback |
| `EMAIL_SENDER` | Email sender address | - | For email |
| `SMTP_HOST` | SMTP server host | - | For email |
| `SMTP_PORT` | SMTP server port | `25` | No |
| `SMTP_USER` | SMTP username | - | For auth |
| `SMTP_PASSWORD` | SMTP password | - | For auth |
| `OAUTH_CLIENT_ID` | OAuth client ID | - | For auth |
| `OAUTH_CLIENT_SECRET` | OAuth client secret | - | For auth |
| `OAUTH_DISCOVERY_URL` | OAuth discovery URL | - | For auth |
| `OAUTH_CALLBACK_URL` | OAuth callback URL | `https://localhost/api/login` | No |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Gemini API key | - | For Gemini |
| `BRAVE_SEARCH_API_KEY` | Brave Search API key | - | For search |
| `DATA_GOV_API_KEY` | Data.gov API key | - | For gov search |
| `CONGRESS_GOV_API_KEY` | Congress.gov API key | - | For congress search |
| `LOG_LEVEL` | Winston logger level | `info` | No |

## Development Notes

### Database Setup
The server uses Sequelize's `sync({ alter: true })` mode which:
- Creates tables if they don't exist
- Adds new columns to existing tables
- Modifies column types if needed

### Usage Tracking
- All model requests are tracked in the Usage table
- Usage limits are enforced per user
- Automatic reset via cron job in `scheduler.js`

### Security Features
- OpenID Connect authentication
- Role-based access control
- API key validation
- Domain whitelisting for proxy requests
- HTTPS required for production

### Adding New AI Providers
1. Create provider class in `services/providers/`
2. Implement `converse()` and `converseStream()` methods
3. Add provider to database
4. Register in `inference.js`

## Deployment

The server is containerized with Docker and can be deployed using the AWS CDK infrastructure in the `infrastructure/` directory.

For local development, use Docker Compose as described in the main project README.