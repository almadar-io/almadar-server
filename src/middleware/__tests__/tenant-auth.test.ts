/**
 * A published app's end users sign in to that app's own Identity Platform tenant. Its routes
 * accept only tokens minted for that tenant, and the Studio's project-level routes refuse a
 * tenant token outright, even though Firebase treats it as a valid token of the project.
 *
 * The Firebase Admin SDK is replaced at its boundary (`getAuth`); the middleware is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request } from 'express';
import request from 'supertest';

interface Decoded { uid: string; firebase: { tenant?: string } }

const verifyProject = vi.fn<(token: string) => Promise<Decoded>>();
const verifyForTenant = vi.fn<(tenant: string, token: string) => Promise<Decoded>>();

vi.mock('../../lib/env.js', () => ({ env: { ALLOW_DEV_AUTH_BYPASS: false } }));
vi.mock('@almadar/integrations/firebase', () => ({
  getAuth: () => ({
    verifyIdToken: (token: string) => verifyProject(token),
    tenantManager: () => ({ authForTenant: (tenant: string) => ({ verifyIdToken: (token: string) => verifyForTenant(tenant, token) }) }),
  }),
}));

const { authenticateFirebase, authenticateFirebaseForTenant } = await import('../authenticateFirebase.js');

function appWith(tenantOf?: (req: Request) => string | null) {
  const app = express();
  app.use(tenantOf ? authenticateFirebaseForTenant(tenantOf) : authenticateFirebase);
  app.get('/me', (req, res) => { res.json({ uid: req.firebaseUser?.uid ?? null }); });
  return app;
}

beforeEach(() => {
  verifyProject.mockReset();
  verifyForTenant.mockReset();
  verifyForTenant.mockImplementation(async (tenant, token) => {
    const [tokenTenant, uid] = token.split(':');
    if (tokenTenant !== tenant) throw new Error('auth/mismatching-tenant-id');
    return { uid, firebase: { tenant } };
  });
});

describe('authenticateFirebaseForTenant', () => {
  it('accepts a token minted for the app\'s tenant', async () => {
    const res = await request(appWith(() => 'tenant-a')).get('/me').set('Authorization', 'Bearer tenant-a:alice');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'alice' });
    expect(verifyForTenant).toHaveBeenCalledWith('tenant-a', 'tenant-a:alice');
  });

  it('control: refuses a token minted for another app\'s tenant', async () => {
    const res = await request(appWith(() => 'tenant-a')).get('/me').set('Authorization', 'Bearer tenant-b:bob');
    expect(res.status).toBe(401);
  });

  it('refuses when the request belongs to no app with a sign-in tenant', async () => {
    const res = await request(appWith(() => null)).get('/me').set('Authorization', 'Bearer tenant-a:alice');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/tenant/);
    expect(verifyForTenant).not.toHaveBeenCalled();
  });

  it('edge: a missing bearer is refused before any verification', async () => {
    const res = await request(appWith(() => 'tenant-a')).get('/me');
    expect(res.status).toBe(401);
    expect(verifyForTenant).not.toHaveBeenCalled();
  });
});

describe('authenticateFirebase (project-level, the Studio\'s own routes)', () => {
  it('accepts a project token', async () => {
    verifyProject.mockResolvedValue({ uid: 'owner', firebase: {} });
    const res = await request(appWith()).get('/me').set('Authorization', 'Bearer project-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'owner' });
  });

  it('control: refuses a published app end user\'s tenant token', async () => {
    verifyProject.mockResolvedValue({ uid: 'alice', firebase: { tenant: 'tenant-a' } });
    const res = await request(appWith()).get('/me').set('Authorization', 'Bearer tenant-a:alice');
    expect(res.status).toBe(401);
  });
});
