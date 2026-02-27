# shared

Common utilities and middleware shared across all services.

## Overview

Workspace library package (not a running service). Provides logging, middleware, and utility functions imported by gateway, cms, server, and other packages.

## Exports

### logger.js

Winston-based logging with structured output.

```js
import logger from "shared/logger.js";
import { createLogger, formatObject } from "shared/logger.js";

logger.info("Server started");
logger.error(new Error("Something failed"));

// Create a named logger
const myLogger = createLogger("my-service", "debug");
```

| Export | Description |
|--------|-------------|
| `default` (logger) | Pre-configured Winston logger named `research-optimizer` |
| `createLogger(name, level?)` | Create a named logger instance (default level: `info`) |
| `formatObject(object)` | Format any value for logging — handles Errors, objects, primitives |

Log format: `[label] [timestamp] [level] - message`

### middleware.js

Express middleware for request logging, error handling, and cache control.

```js
import { logRequests, logErrors, nocache } from "shared/middleware.js";

app.use(logRequests());
app.use(nocache);
// ... routes ...
app.use(logErrors());
```

| Export | Description |
|--------|-------------|
| `logRequests(formatter?)` | Request logging middleware. Default: logs `request.path`. |
| `logErrors(formatter?)` | Error handling middleware. Logs errors, sends JSON error response. |
| `nocache` | Sets no-cache headers on all responses. |

**Note:** The server package extends `logErrors` to add email sending when `EMAIL_DEV` is set. The shared version logs only.

### utils.js

Async route handler wrapper and HTTP error factory.

```js
import { routeHandler, createHttpError } from "shared/utils.js";

app.get("/foo", routeHandler(async (req, res) => {
  // Errors automatically forwarded to next()
  const data = await fetchData();
  res.json(data);
}));

throw createHttpError(404, originalError, "Resource not found");
```

| Export | Description |
|--------|-------------|
| `routeHandler(fn)` | Wraps async Express handler — catches rejected promises and forwards via `next()` |
| `createHttpError(statusCode, error, userMessage)` | Create error with HTTP status code, preserving original error in `additionalError` |

## Usage

Import using the workspace package name:

```js
import logger from "shared/logger.js";
import { logRequests, logErrors } from "shared/middleware.js";
import { routeHandler } from "shared/utils.js";
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | info | Winston logger level (error, warn, info, debug) |
