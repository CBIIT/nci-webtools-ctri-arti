# users

User management, roles, usage tracking, and budget management service.

## Overview

The users service owns the `User`, `Role`, and `Usage` tables. All reads and writes to those tables go through `UserService`. Other services call it through the shared client (`shared/clients/users.js`) which supports both direct (monolith) and HTTP (microservice) modes.

## Quick Start

```bash
npm start -w users
```

## API

### Users

| Method | Path                           | Description                             |
| ------ | ------------------------------ | --------------------------------------- |
| GET    | `/api/v1/users`                | List users (search, sort, filter, page) |
| GET    | `/api/v1/users/resolve`        | Resolve user by `id` or `apiKey` query  |
| GET    | `/api/v1/users/:id`            | Get user by ID (with Role)              |
| POST   | `/api/v1/users`                | Create user                             |
| POST   | `/api/v1/users/find-or-create` | Find by email or create (login flow)    |
| PUT    | `/api/v1/users/:id`            | Update user                             |
| PUT    | `/api/v1/users/:id/profile`    | Update profile (firstName, lastName)    |
| DELETE | `/api/v1/users/:id`            | Delete user                             |

### Roles

| Method | Path            | Description    |
| ------ | --------------- | -------------- |
| GET    | `/api/v1/roles` | List all roles |

### Usage & Analytics

| Method | Path                      | Description                          |
| ------ | ------------------------- | ------------------------------------ |
| POST   | `/api/v1/usage`           | Record usage rows + deduct budget    |
| GET    | `/api/v1/users/:id/usage` | Get usage for a specific user        |
| GET    | `/api/v1/usage`           | Get all usage (filterable)           |
| GET    | `/api/v1/analytics`       | Analytics (group by user/model/time) |

### Budget

| Method | Path                             | Description              |
| ------ | -------------------------------- | ------------------------ |
| POST   | `/api/v1/budgets/reset`          | Reset all user budgets   |
| POST   | `/api/v1/users/:id/budget/reset` | Reset single user budget |

### Config

| Method | Path             | Description          |
| ------ | ---------------- | -------------------- |
| GET    | `/api/v1/config` | Budget schedule info |

### Health

| Method | Path      | Description                               |
| ------ | --------- | ----------------------------------------- |
| GET    | `/health` | Health check — returns `{ status: "ok" }` |

## Key Files

| File            | Description                                        |
| --------------- | -------------------------------------------------- |
| `user.js`       | `UserService` class — all data operations          |
| `api.js`        | REST routes delegating to UserService              |
| `middleware.js` | `requireRole` auth middleware (uses shared client) |
| `index.js`      | Express app setup and server start                 |

## Configuration

| Variable               | Required | Default     | Description                    |
| ---------------------- | -------- | ----------- | ------------------------------ |
| `PORT`                 | No       | 3004        | Service port                   |
| `USAGE_RESET_SCHEDULE` | No       | `0 0 * * *` | Cron schedule for budget reset |
