# database

Shared database package for schema, migrations, readiness, seed data, and integrity checks.

This package is imported by the running services. It is not a deployable service by itself.

## Directory Shape

- [index.js](index.js): database bootstrap and primary exports
- [schema.js](schema.js): Drizzle tables, relations, and seeding logic
- [readiness.js](readiness.js): schema readiness helpers used by service startup
- [sync.js](sync.js): migration helpers and result normalization
- [relational-audit.js](relational-audit.js): integrity auditing
- [csv-loader.js](csv-loader.js): seed-data loader
- [migrations/](migrations/): checked-in SQL migrations
- [data/](data/): CSV seed data and prompt files
- [scripts/](scripts/): audit scripts

## Initialization Behavior

Importing `database` boots the database connection and, unless disabled, the schema lifecycle.

Current sequence from [index.js](index.js):

1. choose PGlite when `PGHOST` is unset, otherwise use PostgreSQL
2. create the Drizzle client with the shared schema
3. run `init.sql`
4. apply checked-in SQL migrations from `migrations/` unless `DB_SKIP_SYNC=true`
5. seed reference data from `data/`
6. run relational integrity checks unless `DB_SKIP_AUDIT=true`

This package is intentionally used by both local direct mode and the standalone HTTP services.

## Schema Overview

The current schema includes these major groups.

### Identity and auth

- `User`
- `Role`
- `Policy`
- `RolePolicy`
- `Session`

### Model and guardrail reference data

- `Provider`
- `Model`
- `Guardrail`
- `Prompt`
- `Tool`

### Conversation state

- `Agent`
- `Conversation`
- `Message`
- `Resource`
- `Vector`

### Join and ownership tables

- `UserAgent`
- `UserTool`
- `AgentTool`

### Usage and budget tracking

- `Usage`

Important schema details that were missing from the old README:

- `Guardrail` is now a first-class table
- `Session` is persisted in the database
- `Usage` uses generalized quantity/unit rows plus `requestId`
- `Resource` now carries `userID` and `conversationID`
- `Agent` can reference `guardrailID`

## Service Ownership

This is the current ownership model at a high level.

| Tables                                                                                                           | Primary writer           |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `User`, `Role`, `Usage`                                                                                          | `users`                  |
| `Provider`, `Model`, `Guardrail` runtime sync                                                                    | `gateway` plus seed data |
| `Prompt`, `Tool`, `Agent`, `Conversation`, `Message`, `Resource`, `Vector`, `UserAgent`, `UserTool`, `AgentTool` | `cms`                    |
| `Session`                                                                                                        | `server`                 |
| `Policy`, `RolePolicy`, baseline reference rows                                                                  | seed data / migrations   |

Some services read across these boundaries:

- `gateway` reads `Model` and `Guardrail`, and records usage through `users`
- `server` reads through service modules rather than treating the database package as its own domain

## Seed Data

Seed data currently comes from [data/](data/):

- `roles.csv`
- `policies.csv`
- `role-policies.csv`
- `providers.csv`
- `models.csv`
- `guardrails.csv`
- `prompts.csv`
- `agents.csv`
- `tools.csv`
- `agent-tools.csv`

Prompt bodies live under [data/prompts](data/prompts).

If `TEST_API_KEY` is set, startup also creates a seeded admin test user.

## Exports

### Default export

```js
import db from "database";
```

### Named exports from `database`

Current named table exports include:

- `User`
- `Role`
- `Policy`
- `RolePolicy`
- `Provider`
- `Model`
- `Prompt`
- `Guardrail`
- `Agent`
- `Conversation`
- `Message`
- `Tool`
- `Resource`
- `Vector`
- `UserAgent`
- `UserTool`
- `AgentTool`
- `Usage`
- `Session`

`index.js` also exports:

- `rawSql(...)`

Additional package entrypoints:

- `database/readiness.js`
- `database/schema.js`
- `database/csv-loader.js`
- `database/relational-audit.js`
- `database/sync.js`

## Configuration

- `DB_STORAGE`: use PGlite and optionally persist to this path
- `DB_SKIP_SYNC=true`: skip `init.sql`, migrations, seeding, and audit
- `DB_SKIP_AUDIT=true`: skip integrity audit after sync
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`: use PostgreSQL instead of PGlite
- `DB_SSL=1`: enable SSL for PostgreSQL
- `TEST_API_KEY`: seed a test admin user

## Useful Commands

From the repo root:

```bash
npm run db
npm run db:sql
npm run db:audit-vectors
npm run db:audit-relations
```

## Notes

- This README is intentionally higher-level than the old one. The old version became inaccurate because it tried to duplicate the full schema by hand.
- For exact truth, trust [schema.js](schema.js), [index.js](index.js), and the migration files in [migrations/](migrations/).
