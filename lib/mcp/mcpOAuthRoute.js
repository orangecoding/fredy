/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getUser } from '../services/storage/userStorage.js';
import { isUnauthorized } from '../api/security.js';
import { createWindowLimiter, getClientIp } from '../api/rateLimiter.js';
import { mcpOAuthUrls } from './mcpOAuthUrls.js';
import {
  createAuthorizationCode,
  createClient,
  getClient,
  redeemAuthorizationCode,
  refreshAccessToken,
} from './mcpOAuthStorage.js';

const SCOPE = 'mcp:read';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Wrap page markup in Fredy's branded, self-contained chrome. No external assets: the styles are
 * inline so the page renders identically behind a reverse proxy that only forwards `/api/oauth/*`,
 * and it follows the OS light/dark preference so it does not flash against the rest of the app.
 *
 * @param {{title: string, body: string}} page
 */
const renderPage = ({ title, body }) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(
    title,
  )}</title><style>:root{color-scheme:light dark;--bg:#f4f5f7;--card:#ffffff;--fg:#1f2430;--muted:#6b7280;--line:#e5e7eb;--accent:#e2564d;--accent-fg:#ffffff;--chip:#f3f4f6}@media(prefers-color-scheme:dark){:root{--bg:#15171c;--card:#1e2128;--fg:#e8eaed;--muted:#9aa1ac;--line:#2c313b;--chip:#262b34}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}.card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:32px;box-shadow:0 12px 32px rgba(0,0,0,.12)}.brand{display:flex;align-items:center;gap:7px;font-weight:700;font-size:19px;letter-spacing:-.01em}.brand .heart{color:var(--accent)}h1{margin:22px 0 6px;font-size:20px;letter-spacing:-.02em}.lead{margin:0 0 20px;color:var(--muted)}.lead strong{color:var(--fg)}.scopes{list-style:none;margin:0 0 24px;padding:0;border:1px solid var(--line);border-radius:12px;overflow:hidden}.scopes li{display:flex;align-items:center;gap:10px;padding:12px 14px;font-size:14px}.scopes li+li{border-top:1px solid var(--line)}.scopes .tick{flex:none;width:18px;height:18px;color:var(--accent)}.btn{display:block;width:100%;border:0;border-radius:10px;padding:12px 16px;font:inherit;font-weight:600;cursor:pointer;text-align:center;text-decoration:none}.btn-allow{background:var(--accent);color:var(--accent-fg)}.btn-allow:hover{filter:brightness(1.05)}.btn-secondary{background:transparent;color:var(--muted);margin-top:8px}.foot{margin:20px 0 0;padding-top:16px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);text-align:center}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--fg)}</style></head><body><main class="card">${body}</main></body></html>`;

const CHECK =
  '<svg class="tick" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BRAND = '<div class="brand">Fredy <span class="heart">&#9829;</span></div>';

/** Host portion of a redirect URI, for the "you are returning to X" footer. Never throws. */
const safeHost = (uri) => {
  try {
    return new URL(uri).host;
  } catch {
    return '';
  }
};

/**
 * Unauthenticated registration needs a ceiling. Ten new clients an hour from one address is far
 * more than any real connector setup takes, and keeps a scripted loop from filling the clients
 * table faster than the sweep empties it.
 */
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_REGISTRATIONS_PER_WINDOW = 10;
const registrationAttempts = createWindowLimiter(REGISTRATION_WINDOW_MS);

async function oauthUrls() {
  const urls = await mcpOAuthUrls();
  if (!urls) throw new Error('Fredy baseUrl must be configured for OAuth');
  return urls;
}

function validRedirectUri(uri) {
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && ['127.0.0.1', '::1', 'localhost'].includes(parsed.hostname))
    );
  } catch {
    return false;
  }
}

/** @param {string} redirectUri @param {Record<string, string>} params */
function redirect(redirectUri, params) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/** @param {import('fastify').FastifyRequest} request */
async function authorizationRequest(request) {
  const params = request.method === 'GET' ? request.query : request.body;
  const client = typeof params?.client_id === 'string' ? getClient(params.client_id) : null;
  if (!client || typeof params?.redirect_uri !== 'string' || !client.redirectUris.includes(params.redirect_uri))
    return { error: 'invalid_request' };
  const urls = await oauthUrls();
  const validPkce =
    params.code_challenge_method === 'S256' &&
    typeof params.code_challenge === 'string' &&
    PKCE_CHALLENGE.test(params.code_challenge);
  const validScope = String(params.scope || '')
    .split(' ')
    .includes(SCOPE);
  if (params.response_type !== 'code' || !validPkce || params.resource !== urls.resource || !validScope)
    return { error: 'invalid_request' };
  return { params, client, urls };
}

/**
 * Mount discovery, registration, authorization and token endpoints.
 *
 * Everything goes into an encapsulated plugin. The form-encoded body parser the token and consent
 * endpoints need must not leak to the rest of the application: a parser registered on the root
 * instance would let every JSON route accept a form post, which is exactly the request a browser
 * can be made to send cross-site without a preflight.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function registerMcpOAuthRoutes(fastify) {
  await fastify.register(mcpOAuthPlugin);
}

/** @param {import('fastify').FastifyInstance} fastify */
async function mcpOAuthPlugin(fastify) {
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body)));
  });

  fastify.get('/.well-known/oauth-protected-resource/api/mcp', async () => {
    const urls = await oauthUrls();
    return { resource: urls.resource, authorization_servers: [urls.baseUrl], scopes_supported: [SCOPE] };
  });

  fastify.get('/.well-known/oauth-authorization-server', async () => {
    const urls = await oauthUrls();
    return {
      issuer: urls.baseUrl,
      authorization_endpoint: `${urls.baseUrl}/api/oauth/authorize`,
      token_endpoint: `${urls.baseUrl}/api/oauth/token`,
      registration_endpoint: `${urls.baseUrl}/api/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [SCOPE],
    };
  });

  fastify.post('/api/oauth/register', async (request, reply) => {
    if (registrationAttempts.hit(getClientIp(request), MAX_REGISTRATIONS_PER_WINDOW)) {
      return reply.code(429).send({ error: 'too_many_requests' });
    }
    const {
      redirect_uris: redirectUris,
      client_name: clientName,
      grant_types,
      token_endpoint_auth_method: authMethod,
    } = request.body || {};
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every(validRedirectUri)) {
      return reply.code(400).send({ error: 'invalid_redirect_uri' });
    }
    if (
      (grant_types && !grant_types.every((grant) => ['authorization_code', 'refresh_token'].includes(grant))) ||
      (authMethod && authMethod !== 'none')
    ) {
      return reply.code(400).send({ error: 'invalid_client_metadata' });
    }
    const client = createClient({ clientName: typeof clientName === 'string' ? clientName : undefined, redirectUris });
    return reply.code(201).send({
      client_id: client.clientId,
      client_name: clientName,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });

  fastify.get('/api/oauth/authorize', async (request, reply) => {
    const authorization = await authorizationRequest(request);
    if (authorization.error) return reply.code(400).send({ error: authorization.error });
    if (await isUnauthorized(request)) {
      const loginUrl = `/#/login?returnTo=${encodeURIComponent(request.raw.url)}`;
      return reply
        .type('text/html')
        .code(401)
        .send(
          renderPage({
            title: 'Sign in · Fredy',
            body: `${BRAND}<h1>Sign in to continue</h1><p class="lead">You need to be signed in to Fredy before you can authorize this application.</p><a class="btn btn-allow" href="${escapeHtml(
              loginUrl,
            )}">Sign in to Fredy</a>`,
          }),
        );
    }
    const clientName = authorization.client.name || 'This application';
    const returnHost = safeHost(authorization.params.redirect_uri);
    return reply.type('text/html').send(
      renderPage({
        title: 'Authorize · Fredy',
        body: `${BRAND}<h1>Authorize access</h1><p class="lead"><strong>${escapeHtml(
          clientName,
        )}</strong> wants to connect to your Fredy account.</p><ul class="scopes"><li>${CHECK}Read your saved property listings</li><li>${CHECK}Read your search jobs and their results</li></ul><form method="post"><input type="hidden" name="response_type" value="code"><input type="hidden" name="client_id" value="${escapeHtml(
          authorization.params.client_id,
        )}"><input type="hidden" name="redirect_uri" value="${escapeHtml(
          authorization.params.redirect_uri,
        )}"><input type="hidden" name="state" value="${escapeHtml(
          authorization.params.state || '',
        )}"><input type="hidden" name="code_challenge" value="${escapeHtml(
          authorization.params.code_challenge,
        )}"><input type="hidden" name="code_challenge_method" value="S256"><input type="hidden" name="resource" value="${escapeHtml(
          authorization.urls.resource,
        )}"><input type="hidden" name="scope" value="${SCOPE}"><button type="submit" class="btn btn-allow">Allow access</button></form>${
          returnHost
            ? `<p class="foot">You will be returned to <span class="mono">${escapeHtml(returnHost)}</span></p>`
            : ''
        }`,
      }),
    );
  });

  fastify.post('/api/oauth/authorize', async (request, reply) => {
    const authorization = await authorizationRequest(request);
    if (authorization.error) return reply.code(400).send({ error: authorization.error });
    if (await isUnauthorized(request)) return reply.code(401).send({ error: 'login_required' });
    const user = getUser(request.session.currentUser);
    if (!user) return reply.code(401).send({ error: 'login_required' });
    const code = createAuthorizationCode({
      clientId: authorization.client.clientId,
      userId: user.id,
      redirectUri: authorization.params.redirect_uri,
      codeChallenge: authorization.params.code_challenge,
      resource: authorization.urls.resource,
      scopes: [SCOPE],
    });
    return reply.redirect(
      redirect(authorization.params.redirect_uri, {
        code,
        ...(authorization.params.state ? { state: authorization.params.state } : {}),
      }),
    );
  });

  fastify.post('/api/oauth/token', async (request, reply) => {
    const body = request.body || {};
    let tokens;
    if (
      body.grant_type === 'authorization_code' &&
      typeof body.code === 'string' &&
      typeof body.client_id === 'string' &&
      typeof body.redirect_uri === 'string' &&
      typeof body.code_verifier === 'string'
    ) {
      tokens = redeemAuthorizationCode({
        code: body.code,
        clientId: body.client_id,
        redirectUri: body.redirect_uri,
        codeVerifier: body.code_verifier,
      });
    } else if (
      body.grant_type === 'refresh_token' &&
      typeof body.refresh_token === 'string' &&
      typeof body.client_id === 'string'
    ) {
      tokens = refreshAccessToken({ refreshToken: body.refresh_token, clientId: body.client_id });
    } else return reply.code(400).send({ error: 'invalid_request' });
    if (!tokens) return reply.code(400).send({ error: 'invalid_grant' });
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      scope: tokens.scopes.join(' '),
    };
  });
}
