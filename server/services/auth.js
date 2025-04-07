import * as client from "openid-client";
import { Strategy } from 'openid-client/build/passport.js';

/**
 * Returns the authorization URL for the OpenID Connect provider.
 * @param {string} url - The redirect URI. 
 * @param {object} env - The environment variables containing OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_DISCOVERY_URL, and OAUTH_CLIENT_SCOPES.
 * @returns {Promise<{ url: string, verifier: string }>} - The authorization URL and the PKCE code verifier.
 */
export async function getAuthorizationUrl(url, env = process.env) {
  const { OAUTH_DISCOVERY_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_CLIENT_SCOPES } = env;
  const config = await client.discovery(new URL(OAUTH_DISCOVERY_URL), OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET);
  const verifier = client.randomPKCECodeVerifier();

  let parameters = {
    redirect_uri: url,
    scope: OAUTH_CLIENT_SCOPES,
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  };
  
  if (!config.serverMetadata().supportsPKCE()) {
    parameters.state = client.randomState();
  }
  
  const url = client.buildAuthorizationUrl(config, parameters);
  return { url, verifier };
}

export async function configureOidcStrategy(env = process.env) {
  const config = await client.discovery(new URL(env.OAUTH_DISCOVERY_URL), env.OAUTH_CLIENT_ID, env.OAUTH_CLIENT_SECRET);
  const verify = async (tokenset, userinfo, done) => {
    console.log("tokenset", tokenset);    console.log("claims", claims);

    const claims = tokenset.claims();
    await done(null, { tokenset, userinfo, claims });
  }
}

/**
 * Creates and configures an OpenID Connect Passport strategy instance.
 *
 * @async
 * @param {object} params - Configuration parameters.
 * @param {string} params.issuerUrl - The OIDC Provider's Issuer URL.
 * @param {string} params.clientId - The Client ID registered with the OIDC provider.
 * @param {string} params.callbackUrl - The absolute URL where the OIDC provider should redirect back after authentication. Must be registered with the provider.
 * @param {function} params.verify - The Passport verify callback function. Receives (tokenset, done) or (req, tokenset, done) if passReqToCallback is true.
 * @param {string} [params.clientSecret] - The Client Secret (optional, depends on client authentication method).
 * @param {object} [params.clientAuthMethod] - The openid-client authentication method function (e.g., client.ClientSecretPost(), client.ClientSecretBasic(), client.None()). Defaults based on clientSecret presence.
 * @param {object} [params.discoveryOptions] - Optional options passed to client.discovery.
 * @param {object} [params.strategyOptions] - Optional options passed directly to the OidcStrategy constructor (e.g., scope, passReqToCallback, sessionKey, usePAR, useJAR, DPoP, name).
 * @returns {Promise<OidcStrategy>} A Promise that resolves with the configured OidcStrategy instance.
 * @throws {Error} Throws an error if discovery or configuration fails.
 */
export async function createOidcStrategy({
    issuerUrl,
    clientId,
    clientSecret,
    callbackUrl,
    verify,
    clientAuthMethod,
    discoveryOptions = {},
    strategyOptions = {},
}) {
    if (!issuerUrl || !clientId || !callbackUrl || typeof verify !== 'function') {
        throw new Error('Missing required parameters: issuerUrl, clientId, callbackUrl, and verify function must be provided.');
    }

    try {
        // Determine Client Authentication method if not explicitly provided
        let authMethod = clientAuthMethod;
        if (!authMethod) {
            if (clientSecret) {
                // Default to ClientSecretPost if secret exists
                authMethod = client.ClientSecretPost(clientSecret);
                console.log(`Using ClientSecretPost authentication for ${issuerUrl}`);
            } else {
                // Default to None if no secret
                authMethod = client.None();
                 console.log(`Using None (public client) authentication for ${issuerUrl}`);
            }
        }

        const config = await client.discovery(
            new URL(issuerUrl),
            clientId,
            clientSecret ? { client_secret: clientSecret } : {},
            authMethod, // Client Authentication
            discoveryOptions // Discovery options
        );
        
        console.log(`OIDC Discovery successful for issuer: ${config.serverMetadata().issuer}`);

        // 2. Instantiate and return the strategy
        const strategy = new Strategy(
            {
                config: config,
                callbackURL: callbackUrl,
                ...strategyOptions,
            },
            verify
        );

        console.log(`OIDC Strategy created for ${strategy.name || new URL(issuerUrl).host}`);
        return strategy;

    } catch (error) {
        console.error(`Failed to create OpenID Connect strategy for ${issuerUrl}:`, error);
        // Re-throw the error so the calling code knows configuration failed
        throw error;
    }
}