const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { resetTestDatabase, seedCoreData, waitForSchema } = require('./helpers');

const mounts = {
  'admin.routes.js': '/admin',
  'auth.routes.js': '/auth',
  'availability.routes.js': '/availability',
  'bot.routes.js': '/bot',
  'cover.routes.js': '',
  'dashboard.routes.js': '',
  'jobs.routes.js': '/jobs',
  'messages.routes.js': '/messages',
  'notifications.routes.js': '/notifications',
  'profile.routes.js': '/profile',
  'requests.routes.js': '',
  'sessions.routes.js': '/units/:unitId/sessions',
  'tutorApplications.routes.js': '/tutor-applications',
  'tutors.routes.js': '/units/:unitId/tutors',
  'unitMessages.routes.js': '/units/:unitId/messages',
  'units.routes.js': '/units'
};

const publicRoutes = new Set([
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/forgot-password',
  'POST /auth/reset-password',
  'GET /tutor-applications/unit/:unitId',
  'POST /tutor-applications',
  'GET /tutor-applications/verify-invite/:token',
  'POST /tutor-applications/accept-invite'
]);
const secretRoutes = new Set(['POST /jobs/session-assignment-reminders']);
const routeFiles = fs.readdirSync(path.join(__dirname, '..', 'routes'))
  .filter((file) => file.endsWith('.routes.js'));

if (routeFiles.some((file) => !Object.hasOwn(mounts, file)) || Object.keys(mounts).some((file) => !routeFiles.includes(file))) {
  throw new Error('Route mount inventory changed; update the API security coverage map');
}

const routes = routeFiles.flatMap((file) => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', file), 'utf8');
  const routePattern = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
  return [...source.matchAll(routePattern)].map((match) => ({
    method: match[1].toUpperCase(),
    path: (`${mounts[file]}${match[2]}`.replace(/\/$/, '') || '/'),
    file
  }));
});

const routeKeys = new Set(routes.map(({ method, path: routePath }) => `${method} ${routePath}`));
if (routes.length !== routeKeys.size || [...publicRoutes, ...secretRoutes].some((key) => !routeKeys.has(key))) {
  const missing = [...publicRoutes, ...secretRoutes].filter((key) => !routeKeys.has(key));
  throw new Error(`Duplicate routes or stale public/secret route classification: missing ${missing.join(', ')}`);
}

let app;
let server;
let io;
let pool;
let ctx;

const urlFor = (routePath) => routePath.replace(/:[A-Za-z]+/g, (parameter) => {
  if (parameter === ':unitId') return ctx.unit.id;
  if (parameter === ':sessionId') return ctx.sessions.tutorial.id;
  if (parameter === ':tutorId' || parameter === ':userId' || parameter === ':otherUserId') return ctx.users.tutor.id;
  return '00000000-0000-0000-0000-000000000000';
});

beforeAll(async () => {
  await resetTestDatabase();
  ({ app, server, io } = require('../server'));
  pool = require('../db');
  await waitForSchema();
  ctx = await seedCoreData();
});

afterAll(async () => {
  if (io) io.close();
  if (server) server.close();
  if (pool) await pool.end();
});

describe('Complete API authentication inventory', () => {
  test('all current route files and endpoints are discovered', () => {
    expect(routeFiles).toHaveLength(16);
    expect(routes).toHaveLength(106);
    expect(publicRoutes.size).toBe(8);
    expect(secretRoutes.size).toBe(1);
  });

  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    if (publicRoutes.has(key)) continue;

    test(`${key} rejects a missing credential`, async () => {
      const response = await request(app)[route.method.toLowerCase()](urlFor(route.path));
      expect(response.status).toBe(401);
    });

    test(`${key} rejects an invalid credential`, async () => {
      const response = await request(app)[route.method.toLowerCase()](urlFor(route.path))
        .set(secretRoutes.has(key) ? 'x-cron-secret' : 'Authorization',
          secretRoutes.has(key) ? 'invalid-secret' : 'Bearer invalid-token');
      expect(response.status).toBe(401);
    });

    if (secretRoutes.has(key)) continue;

    test(`${key} reaches the handler with a valid role`, async () => {
      const token = route.file === 'admin.routes.js' ? ctx.tokens.admin : ctx.tokens.coordinator;
      const response = await request(app)[route.method.toLowerCase()](urlFor(route.path))
        .set('Authorization', `Bearer ${token}`)
        .send(['POST', 'PUT', 'PATCH'].includes(route.method) ? {} : undefined);
      expect(response.status).not.toBe(401);
      expect(response.status).toBeLessThan(500);
    });
  }
});
