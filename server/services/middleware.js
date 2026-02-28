import db, { Role, User } from "database";

import { eq } from "drizzle-orm";
import Provider from "oidc-provider";
import * as client from "openid-client";
import logger, { formatObject } from "shared/logger.js";

import { sendLogReport } from "./email.js";

const {
  HOSTNAME,
  PORT,
  OAUTH_CALLBACK_URL,
  OAUTH_DISCOVERY_URL,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  EMAIL_DEV,
} = process.env;

/**
 * Logs errors (should be used as the last middleware)
 * Server version wraps shared logErrors to add email sending.
 * @param {function} formatter
 * @returns (error, request, response, next) => void
 */
export function logErrors(formatter = (e) => ({ error: e.message })) {
  return (error, request, response, _next) => {
    const fullErrorMessage = `${formatObject(error.message)}.\n${formatObject(error.additionalError)}`;
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
      const result = await db.query.User.findFirst({
        where: apiKey ? eq(User.apiKey, apiKey) : eq(User.id, id),
        with: { Role: true },
      });
      if (!result) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const role = result.Role;
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
      req.session.user = result;
      next();
    } catch (err) {
      next(err);
    }
  };
}
