# shared

Shared helpers used across the backend packages.

This package is a utility workspace, not a service. It provides the common pieces that make the direct local mode and HTTP mode behave consistently.

## Directory Shape

- [logger.js](logger.js): structured logging
- [middleware.js](middleware.js): request and error middleware
- [utils.js](utils.js): route/error helpers and date utilities
- [request-context.js](request-context.js): normalized request identity and request-id handling
- [cron.js](cron.js): cron-description helpers
- [search.js](search.js): search-related helpers
- [parsers.js](parsers.js): parsing helpers shared outside `server`
- [s3.js](s3.js): S3 helpers
- [embeddings.js](embeddings.js): embedding constants and helpers
- [embedder.js](embedder.js): embedding generation helpers
- [chunker.js](chunker.js): text chunking helpers
- [gateway-usage.js](gateway-usage.js): usage-related shared constants/helpers
- [service-app.js](service-app.js): shared service startup shell used by standalone services
- [clients/http.js](clients/http.js): low-level JSON and NDJSON HTTP client helpers
- [clients/ndjson.js](clients/ndjson.js): NDJSON stream parsing helpers

## What Shared Owns

### Request identity

[request-context.js](request-context.js) is one of the most important pieces in the package now. It gives the codebase one vocabulary for:

- anonymous vs authenticated request contexts
- internal HTTP header translation
- request-id generation and propagation
- direct mode and HTTP mode parity

If you need to understand how `userId`, `actorType`, or `requestId` flows through the system, start there.

### HTTP-adjacent helpers

[middleware.js](middleware.js) and [utils.js](utils.js) provide the basic route plumbing shared across services:

- request logging
- error logging
- cache suppression
- async route wrapping
- HTTP error creation

### Standalone service shell

[service-app.js](service-app.js) is used by the standalone `gateway`, `cms`, `agents`, and `users` entrypoints to provide:

- `/health`
- schema readiness gating
- delayed mount readiness after migrations/bootstrap

### Transport helpers

[clients/http.js](clients/http.js) and [clients/ndjson.js](clients/ndjson.js) hold the low-level fetch, JSON, and NDJSON helpers used by the service `remote.js` clients.

## Package Exports

The package currently exposes these stable paths that both exist on disk and are intended for reuse:

- `shared/logger.js`
- `shared/middleware.js`
- `shared/utils.js`
- `shared/cron.js`
- `shared/embeddings.js`
- `shared/gateway-usage.js`
- `shared/request-context.js`
- `shared/search.js`
- `shared/parsers.js`
- `shared/s3.js`
- `shared/embedder.js`
- `shared/chunker.js`

## Common Usage

```js
import logger from "shared/logger.js";
import { logRequests, logErrors } from "shared/middleware.js";
import { routeHandler, createHttpError } from "shared/utils.js";
import { createRequestContext, requestContextToInternalHeaders } from "shared/request-context.js";
```

## Configuration

- `LOG_LEVEL`: logger verbosity

## Notes

- The old README only described `logger`, `middleware`, and `utils`. That is no longer enough to understand the package.
- The most architecturally important modules now are [request-context.js](request-context.js) and [service-app.js](service-app.js).
- The list above reflects the current exported shared surface in [package.json](package.json).
