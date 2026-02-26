# users

Identity, authentication, and access management service (stub).

## Overview

The users service will own identity, authentication, and access management. It consolidates the auth flows, user management, role-based access, usage analytics, and rate limit management currently handled by the main server.

**Status:** Stub — currently serves only a health check endpoint.

## Quick Start

```bash
npm start -w users
```

## Current API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — returns `{ status: "ok" }` |

## Planned Responsibilities

- OAuth/OIDC login/logout flows
- Session creation, validation, TTL management
- User CRUD and profile management
- Role-based access control
- Admin user management (list, create, update, delete users)
- Usage analytics (per-user, per-model, time-series)
- Rate limit management (weekly resets, manual resets)
- Email notifications (feedback, error reports)

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3004 | Service port |
