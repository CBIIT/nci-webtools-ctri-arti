# agents

Chat orchestration service. It turns a user message into a streamed assistant response by coordinating CMS state, gateway inference, and tool execution.

## Directory Shape

- [index.js](index.js): standalone HTTP entrypoint
- [app.js](app.js): application interface used by direct callers
- [http.js](http.js): shared chat route definition
- [remote.js](remote.js): HTTP client for remote mode
- [core/](core/): loop, prompt, streaming, and upload helpers
- [tools/](tools/): tool implementations and tool specs
- [test/](test/): service-local tests

This service is no longer a stub. The core loop lives in [core/loop.js](core/loop.js).

## HTTP API

Standalone agents exposes one shared route:

- `POST /api/agents/:agentId/conversations/:conversationId/chat`

Responses stream back as newline-delimited JSON.

`server` mounts that same route definition for the public edge API.

## Runtime Modes

### Direct mode

When `server` composes agents in-process, it builds the application directly with local `gateway` and `cms` modules.

### HTTP mode

Set `AGENTS_URL` for `server`, or run the standalone service. The standalone service can still talk to CMS and gateway either directly or over `CMS_URL` and `GATEWAY_URL`.

## Running It

From the repo root:

```bash
npm start -w agents
npm test -w agents
```

The standalone service defaults to port `3003`.

## Important Environment Variables

- `PORT`
- `CMS_URL`
- `GATEWAY_URL`
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- `DB_STORAGE`
- `DB_SKIP_SYNC`

## Notes

- The old root `loop.js` shim is gone; imports should target [core/loop.js](core/loop.js).
- The service is intentionally small at the boundary: one route, one orchestration responsibility, and the actual loop logic under `core/`.
