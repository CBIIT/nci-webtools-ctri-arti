import Provider from "oidc-provider";
import * as client from "openid-client";
import logger, { formatObject } from "shared/logger.js";

import { sendLogReport } from "../integrations/email.js";

const {
  OAUTH_CALLBACK_URL,
  OAUTH_DISCOVERY_URL,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_PROVIDER_ENABLED,
  OAUTH_PROVIDER_ISSUER,
  EMAIL_DEV,
} = process.env;

const LOCAL_OAUTH_ENABLED = OAUTH_PROVIDER_ENABLED?.toLowerCase() === "true";
let externalOidcConfigPromise;
const localOauthHandlers = new Map();

function getRequestOrigin(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function getLocalIssuer(req) {
  return new URL("/api/oauth/", getRequestOrigin(req));
}

function getLocalEndpoint(issuer, path) {
  return new URL(path, issuer).href;
}

export function getOauthProviderIssuer(req) {
  if (OAUTH_PROVIDER_ISSUER) {
    return new URL(OAUTH_PROVIDER_ISSUER);
  }

  return getLocalIssuer(req);
}

function getCallbackUrl(req) {
  return OAUTH_CALLBACK_URL || new URL("/api/login", getRequestOrigin(req)).href;
}

function getLocalOidcConfig(req) {
  const issuer = getOauthProviderIssuer(req);

  return new client.Configuration(
    {
      issuer: issuer.href,
      authorization_endpoint: getLocalEndpoint(issuer, "auth"),
      token_endpoint: getLocalEndpoint(issuer, "token"),
      userinfo_endpoint: getLocalEndpoint(issuer, "me"),
      jwks_uri: getLocalEndpoint(issuer, "jwks"),
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      claims_supported: ["sub", "email", "email_verified", "given_name", "family_name", "name"],
      code_challenge_methods_supported: ["S256"],
    },
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET
  );
}

async function getExternalOidcConfig() {
  if (!OAUTH_CLIENT_ID) return null;

  if (!externalOidcConfigPromise) {
    externalOidcConfigPromise = client.discovery(
      new URL(OAUTH_DISCOVERY_URL),
      OAUTH_CLIENT_ID,
      OAUTH_CLIENT_SECRET
    );
  }

  return externalOidcConfigPromise;
}

async function getOidcConfig(req) {
  if (LOCAL_OAUTH_ENABLED) {
    return getLocalOidcConfig(req);
  }

  return getExternalOidcConfig();
}

/**
 * Logs errors (should be used as the last middleware)
 * Server version wraps shared logErrors to add email sending.
 * @param {function} formatter
 * @returns (error, request, response, next) => void
 */
export function logErrors(formatter = (e) => ({ error: e.message })) {
  return (error, request, response, _next) => {
    const cause = error.cause?.message ?? error.cause ?? "";
    const fullErrorMessage = `${formatObject(error.message)}.\n${formatObject(error.additionalError)}${cause ? `\nCaused by: ${formatObject(cause)}` : ""}`;
    logger.error(fullErrorMessage);

    if (EMAIL_DEV && EMAIL_DEV.length > 0) {
      const user = request.session?.user;
      const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "N/A";

      sendLogReport({
        reportSource: "Automatic",
        userId: user?.id || "N/A",
        userName,
        recipient: EMAIL_DEV,
        metadata: [
          { label: "Error Message", value: fullErrorMessage },
          { label: "Stack Trace", value: error.stack },
          { label: "Request Path", value: request.path },
        ],
      }).catch((reportError) => {
        logger.error("Failed to send error log report:", reportError.message);
      });
    }

    response.status(error.statusCode || 400).json(formatter(error));
  };
}

/**
 * Login middleware for handling OpenID Connect authentication
 */
export async function loginMiddleware(req, res, next) {
  try {
    const oidcConfig = await getOidcConfig(req);
    if (!oidcConfig) {
      const error = new Error("OIDC is not configured");
      error.statusCode = 503;
      throw error;
    }
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
        redirect_uri: getCallbackUrl(req),
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
 */
export function oauthMiddleware() {
  return (req, res, next) => {
    const issuer = getOauthProviderIssuer(req);

    let handler = localOauthHandlers.get(issuer.href);
    if (!handler) {
      const provider = new Provider(issuer.href, {
        clients: [
          {
            client_id: OAUTH_CLIENT_ID,
            client_secret: OAUTH_CLIENT_SECRET,
            redirect_uris: [OAUTH_CALLBACK_URL || new URL("/api/login", issuer).href],
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
      handler = provider.callback();
      localOauthHandlers.set(issuer.href, handler);
    }

    return handler(req, res, next);
  };
}

/**
 * Returns middleware that touches the session on every request unless
 * the except callback returns true. Use with rolling: false.
 *
 * @param {{ except?: (req) => boolean }} [options]
 * @returns {Function} Express middleware
 */
export function touchSession({ except } = {}) {
  return (req, res, next) => {
    if (except?.(req)) {
      // Neutralize express-session's unconditional end-of-request touch
      if (req.session) req.session.touch = () => {};
      return next();
    }
    req.session?.touch();
    if (req.session) req.session.expires = req.session.cookie.expires;
    next();
  };
}
