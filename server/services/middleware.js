import { Readable } from "stream";
import * as client from "openid-client";
import logger, { formatObject } from "./logger.js";
const { OAUTH_CALLBACK_URL, OAUTH_DISCOVERY_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } = process.env;
export const WHITELIST = [/.*/i];
export const oidcConfig = OAUTH_CLIENT_ID ? await client.discovery(new URL(OAUTH_DISCOVERY_URL), OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET) : null;

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
  return (error, request, response, next) => {
    logger.error(formatObject(error));
    response.status(400).json(formatter(error));
  };
}

/**
 * Login middleware for handling OpenID Connect authentication
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 */
export async function loginMiddleware(req, res, next) {
  try {
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
      expectedState: sess.oidc.state,
      expectedNonce: sess.oidc.nonce,
      pkceCodeVerifier: sess.oidc.codeVerifier,
    };
    const tokenSet = await client.authorizationCodeGrant(oidcConfig, redirectUrl, checks);

    // Fetch user info using the access token and store it in the session
    const userinfo = await client.fetchUserInfo(oidcConfig, tokenSet.access_token, tokenSet.claims().sub);
    sess.tokenSet = tokenSet;
    sess.userinfo = userinfo;
    next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Returns 401 if the user is not authenticated
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 */
export async function authMiddleware(req, res, next) {
    // todo: switch over when keys are verified
  const authDisabled = true;
  if (!authDisabled && !req.session.user) {
    return res.status(401).end("Unauthorized");
  }
  next();
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
export async function proxyMiddleware(req, res, next) {
  const { headers, method, body } = req;
  const host = headers.host?.split(":")[0];
  let urlString = req.path.replace(/^\/[^\/]+\/?/, ""); // remove path prefix
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = "https://" + urlString;
  }
  let url = new URL(urlString)

  // Only allow requests if the hostname matches or is on the whitelist
  if (!WHITELIST.some((regex) => regex.test(url.hostname)) && url.hostname !== host) {
    res.status(403).send("Forbidden: Domain not allowed");
    return;
  }

  try {
    // remove problematic headers
    const cleanHeaders = { ...headers, ...getAuthorizedHeaders(url) };
    ["host", "connection", "content-length"].forEach((h) => delete cleanHeaders[h]);
    const response = await fetch(getAuthorizedUrl(url), {
      method,
      headers: cleanHeaders,
      body,
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
  const params = {
    "api.govinfo.gov": {api_key: env.DATA_GOV_API_KEY},
    "api.congress.gov": {api_key: env.CONGRESS_GOV_API_KEY},
  }[url.hostname] || {};
  for (const key in params) {
    url.searchParams.set(key, params[key]);
  }
  return url.toString();
}

export function getAuthorizedHeaders(url, env = process.env) {
  return {
    "api.search.brave.com": {"x-subscription-token": env.BRAVE_SEARCH_API_KEY},
  }[url.hostname] || {};
}