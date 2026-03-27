# gateway

Inference service for model execution, provider adapters, guardrails, and usage tracking.

## Transport Parity

Changes here must preserve parity between direct/in-process mode and HTTP mode. If behavior,
inputs, outputs, errors, billing, or exported methods change, update the local service/app layer,
HTTP routes, remote client, and parity coverage in the same change.

## Directory Shape

- [index.js](index.js): standalone HTTP entrypoint
- [app.js](app.js): application interface used by direct callers
- [service.js](service.js): local composition for the service implementation
- [http.js](http.js): shared HTTP route definitions
- [remote.js](remote.js): HTTP client used by `server` in remote mode
- [core/](core/): inference, usage, guardrails, and upload-limit logic
- [providers/](providers/): Bedrock, Gemini, and mock provider adapters

The root shows the deployable boundary. The actual domain code lives under `core/` and `providers/`.

## HTTP API

Standalone gateway mounts its routes under `/api/v1`.

Core endpoints:

- `POST /api/v1/model/invoke`
- `GET /api/v1/model/list`
- `GET /api/v1/guardrails`
- `POST /api/v1/guardrails/reconcile`
- `DELETE /api/v1/guardrails/:id`
- `POST /api/v1/usage`
- `POST /api/v1/model-usage`

## Runtime Modes

### Direct mode

Used when `server` composes gateway in-process. This path goes through `gateway/service.js` and the `core/` modules directly.

### HTTP mode

Used when `GATEWAY_URL` is set. `server` talks to `gateway/remote.js`, and standalone gateway serves the shared routes from `gateway/http.js`.

## Running It

From the repo root:

```bash
npm start -w gateway
```

The standalone service defaults to port `3001`.

## Important Environment Variables

- `PORT`
- `USERS_URL`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `GEMINI_API_KEY`
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- `DB_STORAGE`
- `DB_SKIP_SYNC`

## Notes

- The service owns inference-shaped routes once. `server` reuses those route definitions instead of duplicating them.
- Internal implementation paths are now under `gateway/core/*`; the old root shim files are gone.
- For current behavior, trust [http.js](http.js), [service.js](service.js), and the tests under [server/test](../server/test/).
