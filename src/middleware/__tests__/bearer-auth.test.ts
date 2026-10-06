/**
 * The Express middlewares are adapters over `@almadar/auth/server`'s `authenticateBearer`: the
 * provider's verifier is the port (stubbed here), the bearer parsing and tenant rules are real.
 * Tenant semantics of the Firebase verifier itself are covered in `@almadar/auth`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request } from 'express';
import request from 'supertest';
import type { TokenVerifier, VerifiedUser } from '@almadar/auth';

const verify = vi.fn<(token: string, tenant: string | null) => Promise<VerifiedUser>>();
const stubVerifier: TokenVerifier = { provider: 'firebase', verify: (token, tenant) => verify(token, tenant) };

vi.mock('@almadar/auth/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@almadar/auth/server')>()),
  verifierFromEnv: () => stubVerifier,
}));

const { authenticateFirebase, authenticateFirebaseForTenant, identifyBearer } = await import('../authenticateFirebase.js');

function appWith(tenantOf?: (req: Request) => string | null) {
  const app = express();
  app.use(tenantOf ? authenticateFirebaseForTenant(tenantOf) : authenticateFirebase);
  app.get('/me', (req, res) => { res.json({ uid: req.authUser?.uid ?? null, tenant: req.authUser?.tenant ?? null }); });
  return app;
}

beforeEach(() => {
  verify.mockReset();
  verify.mockImplementation(async (token, tenant) => {
    const [tokenTenant, uid] = token.split(':');
    if ((tenant ?? 'project') !== tokenTenant) throw new Error('wrong tenant');
    return { uid, provider: 'firebase', ...(tenant ? { tenant } : {}), claims: { sub: uid } };
  });
});

describe('authenticateFirebaseForTenant', () => {
  it('puts the verified user on the request', async () => {
    const res = await request(appWith(() => 'tenant-a')).get('/me').set('Authorization', 'Bearer tenant-a:alice');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'alice', tenant: 'tenant-a' });
    expect(verify).toHaveBeenCalledWith('tenant-a:alice', 'tenant-a');
  });

  it('control: a rejected token is 401 and never reaches the route', async () => {
    const res = await request(appWith(() => 'tenant-a')).get('/me').set('Authorization', 'Bearer tenant-b:bob');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('refuses when the request belongs to no app with a sign-in tenant', async () => {
    const res = await request(appWith(() => null)).get('/me').set('Authorization', 'Bearer tenant-a:alice');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/tenant/);
    expect(verify).not.toHaveBeenCalled();
  });

  it('edge: a missing bearer is refused before any verification', async () => {
    const res = await request(appWith(() => 'tenant-a')).get('/me');
    expect(res.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('authenticateFirebase (project-level)', () => {
  it('verifies with no tenant', async () => {
    const res = await request(appWith()).get('/me').set('Authorization', 'Bearer project:owner');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'owner', tenant: null });
    expect(verify).toHaveBeenCalledWith('project:owner', null);
  });
});

describe('identifyBearer (routes open to anonymous visitors)', () => {
  function open() {
    const app = express();
    app.use(identifyBearer);
    app.get('/me', (req, res) => { res.json({ uid: req.authUser?.uid ?? null }); });
    return app;
  }

  it('no credential is anonymous, never verified', async () => {
    const res = await request(open()).get('/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: null });
    expect(verify).not.toHaveBeenCalled();
  });

  it('a valid bearer is the verified user', async () => {
    const res = await request(open()).get('/me').set('Authorization', 'Bearer project:owner');
    expect(res.body).toEqual({ uid: 'owner' });
  });

  it('control: a credential that fails verification is refused, not downgraded to anonymous', async () => {
    const res = await request(open()).get('/me').set('Authorization', 'Bearer tenant-b:bob');
    expect(res.status).toBe(401);
  });
});
