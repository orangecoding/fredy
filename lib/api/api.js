/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import Fastify from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { getDirName } from '../utils.js';
import { getSettings, getOrCreateSessionSecret } from '../services/storage/settingsStorage.js';
import { SqliteSessionStore } from '../services/storage/sessionStore.js';
import logger from '../services/logger.js';
import { authHook, adminHook, createSessionCookieOptions } from './security.js';

import loginPlugin from './routes/loginRoute.js';
import demoPlugin from './routes/demoRouter.js';
import jobPlugin from './routes/jobRouter.js';
import versionPlugin from './routes/versionRouter.js';
import listingsPlugin from './routes/listingsRouter.js';
import dashboardPlugin from './routes/dashboardRouter.js';
import financePlugin from './routes/financeRouter.js';
import userSettingsPlugin from './routes/userSettingsRoute.js';
import trackingPlugin from './routes/trackingRoute.js';
import transitPlugin from './routes/transitRoute.js';
import generalSettingsPlugin from './routes/generalSettingsRoute.js';
import backupPlugin from './routes/backupRouter.js';
import debugPlugin, { registerDebugPublicProbe } from './routes/debugRouter.js';
import userPlugin from './routes/userRoute.js';
import priceTrackingPlugin from './routes/priceTrackingRouter.js';
import notificationAdapterPlugin from './routes/notificationAdapterRouter.js';
import notificationChannelPlugin from './routes/notificationChannelRouter.js';
import providerPlugin from './routes/providerRouter.js';
import { registerMcpRoutes } from '../mcp/mcpHttpRoute.js';

const settings = await getSettings();
const PORT = settings.port || 9998;
const sessionSecret = await getOrCreateSessionSecret();

const fastify = Fastify({
  logger: false,
  bodyLimit: 50 * 1024 * 1024, // 50 MB for backup uploads
  // Fredy is nearly always deployed behind a reverse proxy (Docker + nginx/Traefik), where the
  // socket address is the proxy's. With this, `request.ip` follows X-Forwarded-For, which is what
  // the login rate limiter counts against - previously it read the header itself, so an attacker
  // could reset their own counter by varying it, and a deployment without the header locked every
  // user out through the one shared proxy address.
  trustProxy: settings.trustProxy ?? true,
});

// Security headers (CSP disabled to avoid breaking the SPA)
await fastify.register(fastifyHelmet, { contentSecurityPolicy: false });

// Cookie + session (SQLite-backed store, signed cookie).
//
// The cookie's maxAge is fixed at registration time and cannot follow the `sessionTTL` setting
// when an admin changes it later, so it is set to a generous ceiling and security.js does the
// real expiry check per request against the live setting. The cookie therefore outlives the
// session, which is harmless: isUnauthorized() rejects it and the client is sent to the login
// screen. Previously both used a value snapshotted at startup, so changing sessionTTL in the UI
// appeared to work and did nothing until a restart.
//
// The cookie's `secure` flag is decided per request (see createSessionCookieOptions), because one
// instance is commonly reached both through an https proxy and directly over http.
await fastify.register(fastifyCookie);
await fastify.register(fastifySession, {
  secret: sessionSecret,
  cookieName: 'fredy-admin-session',
  // Sessions live in SQLite rather than in the library's default in-memory map: that map is lost
  // on restart (so every upgrade logs everyone out), grows for the life of the process with
  // nothing evicting expired entries, and rules out running more than one process.
  store: new SqliteSessionStore(),
  cookie: createSessionCookieOptions(),
  saveUninitialized: false,
});

// Serve the React SPA from ui/public/
await fastify.register(fastifyStatic, {
  root: path.join(getDirName(), '../ui/public'),
  wildcard: false,
});

// Public routes - no auth required
fastify.register(loginPlugin, { prefix: '/api/login' });
fastify.register(demoPlugin, { prefix: '/api/demo' });

// User-authenticated routes
fastify.register(async (app) => {
  app.addHook('preHandler', authHook);
  app.register(jobPlugin, { prefix: '/api/jobs' });
  app.register(notificationAdapterPlugin, { prefix: '/api/jobs/notificationAdapter' });
  app.register(notificationChannelPlugin, { prefix: '/api/notificationChannels' });
  app.register(providerPlugin, { prefix: '/api/jobs/provider' });
  app.register(versionPlugin, { prefix: '/api/version' });
  app.register(listingsPlugin, { prefix: '/api/listings' });
  app.register(dashboardPlugin, { prefix: '/api/dashboard' });
  app.register(financePlugin, { prefix: '/api/finance' });
  app.register(userSettingsPlugin, { prefix: '/api/user/settings' });
  app.register(trackingPlugin, { prefix: '/api/tracking' });
  app.register(transitPlugin, { prefix: '/api/transit' });
  app.register(generalSettingsPlugin, { prefix: '/api/admin/generalSettings' });
  // The lightweight /api/debug/active probe used by the app-wide red banner. Lives
  // here (under authHook, NOT adminHook) so non-admin users also see the warning
  // banner when an admin has enabled the feature, without exposing the rest of the
  // settings payload.
  app.register(
    async (sub) => {
      registerDebugPublicProbe(sub);
    },
    { prefix: '/api/debug' },
  );
});

// Admin-only routes
fastify.register(async (app) => {
  app.addHook('preHandler', authHook);
  app.addHook('preHandler', adminHook);
  app.register(backupPlugin, { prefix: '/api/admin/backup' });
  app.register(debugPlugin, { prefix: '/api/admin/debug' });
  app.register(userPlugin, { prefix: '/api/admin/users' });
  app.register(priceTrackingPlugin, { prefix: '/api/admin/price-tracking' });
});

// MCP Streamable HTTP (Bearer token auth - no session)
registerMcpRoutes(fastify);

// SPA fallback - serve index.html for all non-API GET requests
fastify.setNotFoundHandler((request, reply) => {
  if (!request.url.startsWith('/api/')) {
    return reply.sendFile('index.html');
  }
  return reply.code(404).send({ error: 'Not found' });
});

await fastify.listen({ port: PORT, host: '0.0.0.0' });
logger.debug(`Started API service on port ${PORT}`);
