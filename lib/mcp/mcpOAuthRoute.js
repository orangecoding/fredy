/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSettings } from '../services/storage/settingsStorage.js';
import { getUser } from '../services/storage/userStorage.js';
import { isUnauthorized } from '../api/security.js';
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

async function oauthUrls() {
  const settings = await getSettings();
  const baseUrl = typeof settings.baseUrl === 'string' ? settings.baseUrl.trim().replace(/\/$/, '') : '';
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://'))
    throw new Error('Fredy baseUrl must be configured for OAuth');
  return {
    baseUrl,
    resource: `${baseUrl}/api/mcp`,
  };
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
  if (
    params.response_type !== 'code' ||
    params.code_challenge_method !== 'S256' ||
    typeof params.code_challenge !== 'string' ||
    !PKCE_CHALLENGE.test(params.code_challenge) ||
    params.resource !== urls.resource ||
    String(params.scope || '')
      .split(' ')
      .includes(SCOPE) === false
  )
    return { error: 'invalid_request', redirectUri: params.redirect_uri, state: params.state };
  return { params, client, urls };
}

/** @param {import('fastify').FastifyInstance} fastify */
export async function registerMcpOAuthRoutes(fastify) {
  // OAuth token requests are form-encoded by specification. Keeping this small parser local
  // avoids making a general request parser accept this content type across the application.
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
        .send(`<p><a href="${escapeHtml(loginUrl)}">Sign in to Fredy to continue</a></p>`);
    }
    return reply
      .type('text/html')
      .send(
        `<!doctype html><title>Authorize Claude</title><main><h1>Authorize access</h1><p>Allow this client to read your Fredy listings and jobs?</p><form method="post"><input type="hidden" name="client_id" value="${escapeHtml(authorization.params.client_id)}"><input type="hidden" name="redirect_uri" value="${escapeHtml(authorization.params.redirect_uri)}"><input type="hidden" name="state" value="${escapeHtml(authorization.params.state || '')}"><input type="hidden" name="code_challenge" value="${escapeHtml(authorization.params.code_challenge)}"><input type="hidden" name="code_challenge_method" value="S256"><input type="hidden" name="resource" value="${escapeHtml(authorization.urls.resource)}"><input type="hidden" name="scope" value="${SCOPE}"><button type="submit">Allow</button></form></main>`,
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
