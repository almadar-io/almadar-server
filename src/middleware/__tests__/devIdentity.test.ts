/**
 * @fileoverview The dev-bypass identity boundary.
 * @module @almadar/server/middleware/devIdentity.test
 *
 * This is a security boundary as much as a dev convenience: the mocked-sign-in
 * token must resolve to a full persona (role included) when the bypass is on, and
 * must be rejected outright when it is off.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encodeDevIdentityToken } from '@almadar/core';

const withBypass = async (value: 'true' | 'false') => {
  vi.resetModules();
  vi.doMock('../../lib/env.js', () => ({ env: { ALLOW_DEV_AUTH_BYPASS: value } }));
  const { resolveDevIdentity } = await import('../devIdentity.js');
  return resolveDevIdentity;
};

const memberToken = encodeDevIdentityToken({
  id: 'member-1',
  name: 'Maya Member',
  email: 'maya@example.com',
  role: 'member',
});

describe('resolveDevIdentity', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('../../lib/env.js'));

  it('is inert unless the bypass is explicitly on', async () => {
    const resolve = await withBypass('false');
    expect(resolve(undefined)).toBeUndefined();
    expect(resolve(`Bearer ${memberToken}`)).toBeUndefined();
  });

  it('injects the fixed dev user when no credential is sent', async () => {
    const resolve = await withBypass('true');
    expect(resolve(undefined)?.uid).toBe('dev-user-001');
    expect(resolve('Basic nonsense')?.uid).toBe('dev-user-001');
  });

  it('carries the persona role, not just the subject', async () => {
    const resolve = await withBypass('true');
    const user = resolve(`Bearer ${memberToken}`);
    expect(user?.uid).toBe('member-1');
    expect(user?.sub).toBe('member-1');
    expect(user?.email).toBe('maya@example.com');
    expect(user?.['role']).toBe('member');
    expect(user?.['name']).toBe('Maya Member');
  });

  it('falls through to real verification for a non-dev bearer token', async () => {
    const resolve = await withBypass('true');
    expect(resolve('Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IngifQ.e30.sig')).toBeUndefined();
  });

  it('falls through rather than inventing an identity from a malformed dev token', async () => {
    const resolve = await withBypass('true');
    expect(resolve('Bearer almadar-dev.not-json')).toBeUndefined();
  });

  it('resolves the roster default viewer when the app declares an [identity] roster', async () => {
    // A roleless synthetic viewer makes every row-ACL'd list render empty —
    // the anonymous dev viewer must BE a roster member when one exists
    // (resolveDefaultViewer contract, mirrored from the interpreter path).
    const resolve = await withBypass('true');
    const { getMockDataService, resetMockDataService } = await import(
      '../../services/MockDataService.js'
    );
    resetMockDataService();
    const service = getMockDataService();
    const personFields = [
      { name: 'id', type: 'string' as const, required: true },
      { name: 'name', type: 'string' as const, required: true },
      {
        name: 'role',
        type: 'string' as const,
        required: true,
        values: ['manager', 'trainer', 'trainee'],
      },
    ];
    service.registerSchema('people', { name: 'Person', identity: true, fields: personFields });
    service.seed('people', personFields, 3);
    const roster = service.getIdentityRoster();
    expect(roster.length).toBeGreaterThan(0);

    const user = resolve(undefined);
    expect(user?.uid).toBe(roster[0]?.id);
    expect(user?.['role']).toBe(roster[0]?.role);

    resetMockDataService();
  });
});
