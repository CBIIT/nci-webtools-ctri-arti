# cms

Conversation management service for agents, conversations, messages, resources, vectors, tools, prompts, and search.

## Directory Shape

- [index.js](index.js): standalone HTTP entrypoint
- [app.js](app.js): application interface used by direct callers
- [service.js](service.js): local composition
- [http.js](http.js): shared HTTP composition root
- [remote.js](remote.js): HTTP client for remote mode
- [core/](core/): conversation-service and domain logic
- [http/](http/): route families and HTTP helpers
- [scripts/](scripts/): operational scripts such as vector reindexing

The service root shows the runtime boundary; the capability code is grouped under `core/` and `http/`.

## HTTP API

Standalone CMS mounts its routes under `/api/v1`.

Route families:

- agents: `/agents`
- conversations and summaries: `/conversations`, `/summarize`
- messages: `/conversations/:conversationId/messages`, `/messages/:id`
- resources: `/resources`, `/agents/:agentId/resources`, `/conversations/:conversationId/resources`
- vectors and search: `/vectors`, `/resources/:resourceId/vectors`, `/search/messages`, `/search/vectors`, `/search/chunks`
- tools and prompts: `/tools`, `/prompts`

`server` mounts the same shared CMS routers for the public API, with browser/session-aware request context in front of them.

## Runtime Modes

### Direct mode

`server` composes CMS in-process through `cms/service.js`. This is the simpler local path.

### HTTP mode

Set `CMS_URL` for `server`, or run standalone CMS directly. The edge server will use `cms/remote.js`, while the service serves `cms/http.js`.

## Running It

From the repo root:

```bash
npm start -w cms
```

The standalone service defaults to port `3002`.

## Important Environment Variables

- `PORT`
- `GATEWAY_URL`
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- `DB_STORAGE`
- `DB_SKIP_SYNC`

## Notes

- The old root-level `conversation.js` shim is gone. The underlying service implementation now lives at [core/conversation-service.js](core/conversation-service.js).
- `cms/http.js` is only the composition root now; the actual route families live in [http/](http/).
- If docs drift again, trust [http.js](http.js), [core/conversation-service.js](core/conversation-service.js), and the route tests under [server/test/routes](../server/test/routes/).
