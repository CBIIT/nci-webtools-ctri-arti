# Research Optimizer

Research Optimizer provides tools to query, transform, and analyze biomedical and regulatory information. Supporting the Clinical & Translational Research Informatics Branch (CTRIB) mission, we streamline workflows and make insights accessible for clinical, research, and regulatory work.

## Architecture Overview

The repository is organized into three main parts:
- **client/**: A buildless SolidJS frontend application using HTML template literals
- **server/**: An Express.js Node.js backend API
- **infrastructure/**: AWS CDK infrastructure code for deployment

### Frontend (client/)
- **Framework**: SolidJS with HTML template literals (NO JSX, buildless)
- **Routing**: @solidjs/router
- **Key Features**:
  - Agent chat interface for LLM interactions
  - Tools for document analysis and translation
  - Federated identity with OpenID Connect
  - Client-side data storage with IndexedDB

### Backend (server/)
- **Framework**: Express.js (ESM modules)
- **Database**: PostgreSQL with pgvector extension
- **Key Services**:
  - API endpoints for LLM inference
  - Authentication and session management
  - Translation services
  - Email services
  - Database models and ORM (Sequelize)
  - Serves the client application with proper SPA routing

## Getting Started

### Development with Docker (Recommended)
```bash
# Clone repository
git clone https://github.com/CBIIT/nci-webtools-ctri-arti
cd nci-webtools-ctri-arti

# Create server environment file
cp server/.env.example server/.env

# Configure server/.env with AWS credentials and Parameter Store values

# Start server+postgres services with watch mode for hot reloading
docker compose up --build -w

# Alternative: Start without watch mode
docker compose up --build
```

### Server-Only Development
```bash
cd server
npm install
npm run cert   # Generate self-signed SSL certificates
npm run start  # Starts server with environment variables
npm run start:dev  # Starts server in watch mode for development
```

**Important Note:** Always use the server to serve the client application. The client requires:
1. HTTPS/SSL certificates (generated automatically by the server)
2. Port 443 for OAuth callback URLs
3. API proxying for backend requests
4. SPA routing support for client-side routes

Standard static file servers like http-server or serve don't properly support this combination of features.

## Usage
1. Go to https://localhost to use application
2. (Ignore invalid cert authority errors when using self-signed certs)
3. To reset your local database (eg: for schema errors), delete the `postgres` folder

## Environment Configuration

Create and configure `server/.env` with the following essential variables:
- AWS credentials (for Bedrock and Translate)
- PostgreSQL connection settings
- Session secret for cookies
- OAuth settings (if using authentication)

See `server/README.md` for complete environment variables reference.

## Development Notes

### Frontend Development
- Uses SolidJS with HTML template literals (buildless approach)
- All JavaScript must be compatible with modern browsers without transpilation
- Follow SolidJS reactivity patterns, wrapping all signal access in functions
- SCSS not supported - use vanilla CSS

### Backend Development
- ES Modules format (type: "module")
- Async/await pattern for asynchronous code
- RESTful API design
- Proper error handling and logging

## More Information

- See `server/README.md` for detailed server documentation and API reference
- See `client/README.md` for SolidJS development patterns and best practices
- See `infrastructure/` for AWS deployment configuration