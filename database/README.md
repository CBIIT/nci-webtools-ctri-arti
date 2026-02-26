# database

Shared database package — Sequelize ORM configuration, model definitions, associations, and seed data.

## Overview

Workspace library package (not a running service). Imported by all services that need database access. Provides model definitions, association setup, and initial seed data loading.

## Quick Start

```js
import { User, Role, Model, Agent, Thread, Message } from "database";
import db from "database";

const user = await User.findByPk(1);
const threads = await Thread.findAll({ where: { userId: 1 } });
```

## Initialization Sequence

When imported, the package:

1. **Select dialect** — PostgreSQL (production) or SQLite (testing), based on `DB_DIALECT`
2. **Create models** — Defines all 11 models and their associations
3. **Sync schema** (unless `DB_SKIP_SYNC=true`):
   - SQLite: `sync({ force: false })`
   - PostgreSQL: `sync({ alter: true })`
4. **Seed data** — Upserts roles, providers, models, prompts, and agents from CSV files

Microservices that connect to an already-initialized database should set `DB_SKIP_SYNC=true`.

## Model Reference

| Model | Key Attributes | Indexes |
|-------|---------------|---------|
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

## Associations

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

## Data Ownership Matrix

Which service owns (writes) each model, and which services read it.

| Model | Owner (writes) | Readers |
|-------|---------------|---------|
| User, Role | server (auth/admin) | gateway (rate limit check) |
| Provider, Model | seed data (read-only at runtime) | gateway (model lookup) |
| Usage | gateway (inference tracking) | server (admin analytics) |
| Prompt | seed data (read-only at runtime) | cms (agent resolution) |
| Agent, Thread, Message, Resource, Vector | cms | server (via cms client) |

## Seed Data

Loaded from CSV files in `data/` via the CSV loader on startup:

| File | Records | Notes |
|------|---------|-------|
| `roles.csv` | 3 | admin, super user, user |
| `providers.csv` | 3 | bedrock, google (apiKey via `env:GEMINI_API_KEY`), mock |
| `models.csv` | 9 | Claude Opus/Sonnet/Haiku, Llama Maverick/Scout, Gemini Pro/Flash, Mock |
| `prompts.csv` | 3 | References `file:prompts/ada.txt`, `fedpulse.txt`, `eagle.txt` |
| `agents.csv` | 3 | Standard Chat, FedPulse, EAGLE (all global: userId=null) |

A test admin user is created when `TEST_API_KEY` is set.

### CSV Loader Features

| Feature | Syntax | Example |
|---------|--------|---------|
| Quoted fields | `"value with, commas"` | `"[{""key"":""val""}]"` |
| Null values | `null` | `null` → `null` |
| File references | `file:relative/path` | `file:prompts/ada.txt` → file contents |
| Environment variables | `env:VAR_NAME` | `env:GEMINI_API_KEY` → process.env value |
| JSON auto-detection | Values starting with `[` or `{` | `[""a""]` → `["a"]` |
| Numeric auto-casting | Numeric strings | `0.005` → `0.005` |

File references are resolved relative to the CSV file's directory.

## Exports

```js
// Named model exports
import { User, Role, Provider, Model, Usage, Prompt, Agent, Thread, Message, Resource, Vector } from "database";

// Default export: Sequelize instance
import db from "database";
```

From `schema.js`:
- `modelDefinitions` — Raw model definition objects
- `associations` — Association configuration array
- `createModels(sequelize)` — Creates and associates all models
- `seedDatabase(models)` — Loads CSVs and upserts seed data

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_DIALECT` | No | postgres | `postgres` or `sqlite` |
| `DB_STORAGE` | No | :memory: | SQLite storage path (sqlite only) |
| `DB_SKIP_SYNC` | No | false | Skip schema sync and seed (for microservices) |
| `PGHOST` | Prod | — | PostgreSQL host |
| `PGPORT` | No | 5432 | PostgreSQL port |
| `PGDATABASE` | No | postgres | PostgreSQL database |
| `PGUSER` | Prod | — | PostgreSQL user |
| `PGPASSWORD` | Prod | — | PostgreSQL password |
| `TEST_API_KEY` | No | — | Creates test admin user |
