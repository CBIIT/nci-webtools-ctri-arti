import { Readable } from "stream";

import Provider from "oidc-provider";
import * as client from "openid-client";

import { Role, User } from "./database.js";
import { sendLogReport } from "./email.js";
import logger, { formatObject } from "./logger.js";

const {
  HOSTNAME,
  PORT,
  OAUTH_CALLBACK_URL,
  OAUTH_DISCOVERY_URL,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  EMAIL_DEV,
} = process.env;
export const WHITELIST = [/.*/i];

/**
 * Logs requests
 * @param {function} formatter
 * @returns (request, response, next) => void
 */
export function logRequests(formatter = (request) => [request.path]) {
  return (request, response, next) => {
    request.startTime = new Date().getTime();
    logger.info(formatter(request));
    next();
  };
}

/**
 * Logs errors (should be used as the last middleware)
 * @param {function} formatter
 * @returns (error, request, response, next) => void
 */
export function logErrors(formatter = (e) => ({ error: e.message })) {
  return (error, request, response, _next) => {
    logger.error(formatObject(error));

    if (EMAIL_DEV && EMAIL_DEV.length > 0) {
      sendLogReport({
        type: "Error",
        reportSource: "Automatic",
        userId: request.session?.user?.id || "N/A",
        origin: "Server",
        recipient: EMAIL_DEV,
        metadata: [
          { label: "Error Message", value: error.message },
          { label: "Stack Trace", value: error.stack },
          { label: "Request Path", value: request.path },
        ],
      }).catch((reportError) => {
        logger.error("Failed to send error log report:", reportError.message);
      });
    }

    response.status(400).json(formatter(error));
  };
}

export function nocache(req, res, next) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, private",
    Expires: "0",
    Pragma: "no-cache",
    "Surrogate-Control": "no-store",
    Vary: "*",
  });
  next();
}

/**
 * Login middleware for handling OpenID Connect authentication
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 */
export async function loginMiddleware(req, res, next) {
  try {
    const oidcConfig = OAUTH_CLIENT_ID
      ? await client.discovery(new URL(OAUTH_DISCOVERY_URL), OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET)
      : null;
    const sess = req.session;

    // Initially, we need to build the authorization URL and redirect the user to the authorization server.
    if (!req.query.code) {
      sess.destination = req.query.destination || "/";
      sess.oidc = {
        codeVerifier: client.randomPKCECodeVerifier(),
        state: client.randomState(),
        nonce: client.randomNonce(),
      };

      const codeChallenge = await client.calculatePKCECodeChallenge(sess.oidc.codeVerifier);

      const authUrl = client.buildAuthorizationUrl(oidcConfig, {
        response_type: "code",
        redirect_uri: OAUTH_CALLBACK_URL,
        scope: "openid profile email",
        state: sess.oidc.state,
        nonce: sess.oidc.nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        prompt: "login",
      });

      return res.redirect(authUrl.toString());
    }

    // After we receive the authorization code, we need to exchange it for an access token.
    const redirectUrl = new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`);
    const checks = {
      expectedState: sess?.oidc?.state,
      expectedNonce: sess?.oidc?.nonce,
      pkceCodeVerifier: sess?.oidc?.codeVerifier,
    };
    const tokenSet = await client.authorizationCodeGrant(oidcConfig, redirectUrl, checks);

    // Fetch user info using the access token and store it in the session
    const userinfo = await client.fetchUserInfo(
      oidcConfig,
      tokenSet.access_token,
      tokenSet.claims().sub
    );
    sess.tokenSet = tokenSet;
    sess.userinfo = userinfo;
    next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Returns middleware for handling local OIDC provider (for development/testing)
 * @returns {Function} Middleware function
 */
export function oauthMiddleware() {
  const hostname = HOSTNAME || "localhost";
  const port = PORT !== "443" ? ":" + PORT : "";
  const issuer = `https://${hostname}${port}`;
  const provider = new Provider(issuer, {
    clients: [
      {
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        redirect_uris: [OAUTH_CALLBACK_URL || "https://localhost/api/login"],
      },
    ],
    claims: {
      profile: ["given_name", "family_name", "name"],
      email: ["email", "email_verified"],
    },
    async findAccount(ctx, subject, _token) {
      return {
        accountId: subject,
        async claims(_use, _scope) {
          return {
            sub: subject,
            email: subject,
            email_verified: true,
            given_name: "Local",
            family_name: "User",
            name: "Local User",
          };
        },
      };
    },
  });
  provider.proxy = true;
  return provider.callback();
}

/**
 * Middleware that requires user to have a specific role
 * @param {string} requiredRole - Name or ID of the required role (e.g., "admin")
 * @returns {Function} Middleware function
 */
export function requireRole(requiredRole) {
  return async (req, res, next) => {
    try {
      const apiKey = req.headers["x-api-key"];
      const id = req.session?.user?.id;
      if (!apiKey && !id) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const user = await User.findOne({
        where: apiKey ? { apiKey } : { id },
        include: [{ model: Role }],
      });
      if (!user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const role = user.Role;
      // Check role requirement (1 = admin, always allowed)
      if (
        requiredRole &&
        role?.id !== 1 &&
        !(role?.name === requiredRole || role?.id === +requiredRole)
      ) {
        return res.status(403).json({ error: "Authorization required" });
      }
      // Set user in session for downstream handlers
      req.session ||= {};
      req.session.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Proxy Middleware that handles requests to external URLs.
 * It validates the URL, checks against a whitelist, and forwards the request.
 * It also handles the response and streams it back to the client.
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 * @returns
 */
export async function proxyMiddleware(req, res, _next) {
  const { headers, method, body, query } = req;
  const host = headers.host?.split(":")[0];
  let urlString = req.path.replace(/^\/[^/]+\/?/, ""); // remove path prefix
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = "https://" + urlString;
  }
  let url = new URL(urlString);
  for (const key in query) {
    url.searchParams.set(key, query[key]);
  }
  // Only allow requests if the hostname matches or is on the whitelist
  if (!WHITELIST.some((regex) => regex.test(url.hostname)) && url.hostname !== host) {
    res.status(403).send("Forbidden: Domain not allowed");
    return;
  }

  try {
    // remove problematic headers
    const normalizedHeaders = { ...headers, ...getAuthorizedHeaders(url) };
    const normalizedBody =
      headers["content-type"] === "application/json" ? JSON.stringify(body) : body;
    ["host", "connection", "content-length"].forEach((h) => delete normalizedHeaders[h]);
    const response = await fetch(getAuthorizedUrl(url), {
      method,
      headers: normalizedHeaders,
      body: normalizedBody,
      redirect: "follow",
    });
    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "");
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).send(`Proxy error: ${error.message}`);
  }
}

export function getAuthorizedUrl(url, env = process.env) {
  const params =
    {
      "api.govinfo.gov": { api_key: env.DATA_GOV_API_KEY },
      "api.congress.gov": { api_key: env.CONGRESS_GOV_API_KEY },
    }[url.hostname] || {};
  for (const key in params) {
    url.searchParams.set(key, params[key]);
  }
  return url.toString();
}

export function getAuthorizedHeaders(url, env = process.env) {
  return (
    {
      "api.search.brave.com": { "x-subscription-token": env.BRAVE_SEARCH_API_KEY },
    }[url.hostname] || {}
  );
}
