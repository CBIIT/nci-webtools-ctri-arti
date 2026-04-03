# users

User and budget service. It owns identity records, roles, configuration, usage rows, analytics, and budget reset operations.

## Transport Parity

Changes here must preserve parity between direct/in-process mode and HTTP mode. If behavior,
inputs, outputs, errors, auth data, or exported methods change, update the application interface,
HTTP routes, remote client, and parity coverage in the same change.

## Directory Shape

- [index.js](index.js): standalone HTTP entrypoint
- [app.js](app.js): application interface used by direct callers
- [http.js](http.js): shared HTTP routes
- [remote.js](remote.js): HTTP client for remote mode
- [user.js](user.js): core service implementation

This package is still small enough to stay mostly flat.

## HTTP API

Standalone users mounts its routes under `/api`.

Route families:

- users: `/v1/users`, `/v1/users/resolve`, `/v1/users/:id`, `/v1/users/find-or-create`
- roles: `/v1/roles`
- usage and analytics: `/v1/usage`, `/v1/users/:id/usage`, `/v1/analytics`
- budgets: `/v1/budgets/reset`, `/v1/users/:id/budget/reset`
- config: `/v1/config`

Usage and analytics date filters:

- `startDate` and `endDate` accept either `YYYY-MM-DD` or a full UTC timestamp like `2026-03-09T08:30:00.000Z`.
- Optional `tz` accepts an IANA timezone like `America/New_York` and defaults to `America/New_York`.
- Date-only values expand to the full day in `tz`.
- Full UTC timestamps are treated as exact bounds.
- Full timestamps without an explicit timezone are normalized as UTC.

`server` does not mirror these routes directly. Instead, edge-owned admin and auth routes call the users module in-process or through `users/remote.js`.

## Runtime Modes

### Direct mode

`server` composes `users/app.js` directly when `USERS_URL` is unset.

### HTTP mode

Set `USERS_URL` for `server`, or run the standalone service separately.

## Running It

From the repo root:

```bash
npm start -w users
```

The standalone service defaults to port `3004`.

## Important Environment Variables

- `PORT`
- `USAGE_RESET_SCHEDULE`
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- `DB_STORAGE`
- `DB_SKIP_SYNC`

## Notes

- `users` is the source of truth for roles, usage, and budget configuration.
- `server` owns browser/session-facing auth routes, but the underlying user reads and writes belong here.
