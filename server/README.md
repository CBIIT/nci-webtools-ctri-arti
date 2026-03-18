# server

The edge application. It owns HTTPS, session/auth flows, static client serving, edge-only routes, and composition of the internal services.

## What Lives Here

- [server.js](server.js): process entrypoint and HTTP/HTTPS server setup
- [compose.js](compose.js): selects direct modules or HTTP remotes for `users`, `gateway`, `cms`, and `agents`
- [auth.js](auth.js): role checks and identity resolution
- [api/](api/): edge API composition and edge-only route families
- [integrations/](integrations/): S3, Textract, Translate, proxy, parser, and email adapters
- [runtime/](runtime/): session store and scheduled jobs
- [templates/](templates/): email/report templates
- [test/](test/): backend and integration-oriented tests

## API Shape

All public API routes are mounted under `/api`.

### Edge-owned routes

These are owned by `server` because they are browser-facing or session-aware:

- auth and session: `/login`, `/logout`, `/session`, `/config`, optional `/oauth/*`
- admin: `/admin/*`
- tools and integrations: `/status`, `/search`, `/browse/*url`, `/textract`, `/translate`, `/translate/languages`, `/feedback`, `/log`, `/data`, `/usage`

### Mounted service-owned routes

`server/api/index.js` mounts shared routers from the service packages rather than reimplementing them:

- `agents/http.js`: `/agents/:agentId/conversations/:conversationId/chat`
- `cms/http.js`: `/agents`, `/conversations`, `/messages`, `/resources`, `/vectors`, `/tools`, `/prompts`, `/search/*`
- `gateway/http.js`: `/model`, `/model/list`

That is the current boundary rule: browser-facing edge concerns stay in `server`; service-shaped APIs live with the service and get mounted here.

## Deployment Modes

### Direct local mode

Default when service URLs are unset.

```text
server
  |- users app
  |- gateway service
  |- cms service
  `- agents app
```

This is the simplest local mode and the one the codebase is optimized around.

### HTTP mode

Set any of these to move a service out of process:

- `USERS_URL`
- `GATEWAY_URL`
- `CMS_URL`
- `AGENTS_URL`

`compose.js` will use the corresponding `remote.js` client instead of the in-process module.

## Running It

```bash
cp .env.example .env
cp test.env.example test.env
npm start
```

Dev watch mode:

```bash
npm run start:dev
```

From the repo root:

```bash
npm start -w server
```

## Testing

```bash
npm test
npm run test:unit
npm run test:integration
```

The `server/test` suite is broader than a normal service-local test folder because it verifies:

- direct local composition
- public edge routing
- parity between direct and HTTP-backed service calls

## Key Environment Variables

See [.env.example](.env.example) and [test.env.example](test.env.example) for the full current set.

The ones that matter most for structure are:

- `PORT`
- `SESSION_SECRET`
- `CLIENT_FOLDER`
- `USERS_URL`
- `GATEWAY_URL`
- `CMS_URL`
- `AGENTS_URL`
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- `DB_STORAGE`
- `OAUTH_PROVIDER_ENABLED`, `OAUTH_DISCOVERY_URL`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_CALLBACK_URL`
- optional local OAuth issuer override: `OAUTH_PROVIDER_ISSUER`

## Notes

- `server` is not a generic proxy. It is the browser boundary and BFF.
- The internal service APIs are still first-class because they must also run in Docker Compose and ECS.
- When docs or code disagree, trust `server/api/index.js`, `compose.js`, and the tests.
