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
import logger from '../services/logger.js';
import { authHook, adminHook } from './security.js';

import loginPlugin from './routes/loginRoute.js';
import demoPlugin from './routes/demoRouter.js';
import jobPlugin from './routes/jobRouter.js';
import versionPlugin from './routes/versionRouter.js';
import listingsPlugin from './routes/listingsRouter.js';
import dashboardPlugin from './routes/dashboardRouter.js';
import userSettingsPlugin from './routes/userSettingsRoute.js';
import trackingPlugin from './routes/trackingRoute.js';
import generalSettingsPlugin from './routes/generalSettingsRoute.js';
import backupPlugin from './routes/backupRouter.js';
import userPlugin from './routes/userRoute.js';
import notificationAdapterPlugin from './routes/notificationAdapterRouter.js';
import providerPlugin from './routes/providerRouter.js';
import { registerMcpRoutes } from '../mcp/mcpHttpRoute.js';

const PORT = (await getSettings()).port || 9998;
const sessionSecret = await getOrCreateSessionSecret();
const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;

const fastify = Fastify({
  logger: false,
  bodyLimit: 50 * 1024 * 1024, // 50 MB for backup uploads
});

// Security headers (CSP disabled to avoid breaking the SPA)
await fastify.register(fastifyHelmet, { contentSecurityPolicy: false });

// Cookie + session (in-memory store, signed cookie)
await fastify.register(fastifyCookie);
await fastify.register(fastifySession, {
  secret: sessionSecret,
  cookieName: 'fredy-admin-session',
  cookie: {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
  },
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
  app.register(providerPlugin, { prefix: '/api/jobs/provider' });
  app.register(versionPlugin, { prefix: '/api/version' });
  app.register(listingsPlugin, { prefix: '/api/listings' });
  app.register(dashboardPlugin, { prefix: '/api/dashboard' });
  app.register(userSettingsPlugin, { prefix: '/api/user/settings' });
  app.register(trackingPlugin, { prefix: '/api/tracking' });
});

// Admin-only routes
fastify.register(async (app) => {
  app.addHook('preHandler', authHook);
  app.addHook('preHandler', adminHook);
  app.register(generalSettingsPlugin, { prefix: '/api/admin/generalSettings' });
  app.register(backupPlugin, { prefix: '/api/admin/backup' });
  app.register(userPlugin, { prefix: '/api/admin/users' });
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
