/**
 * @fileoverview The data-source boundary in the env schema.
 * @module @almadar/server/lib/env.test
 *
 * `USE_MOCK_DATA` decides whether the server serves real rows or in-memory
 * fabrications. It used to default to `'true'` — the only fail-open default in
 * the schema, while its neighbours (`NODE_ENV` → `production`,
 * `ALLOW_DEV_AUTH_BYPASS` → `false`) were deliberately hardened. These tests pin
 * the corrected posture so the default cannot drift back.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

/** Load a fresh copy of the env module under a specific process environment. */
const loadEnv = async (vars: Record<string, string | undefined>) => {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) {
    // Unset, not blank: '' is not a valid enum member and would fail parsing
    // for a reason unrelated to what the test is asserting.
    if (value === undefined) delete process.env[key];
    else vi.stubEnv(key, value);
  }
  return import('../env.js');
};

describe('USE_MOCK_DATA', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is OFF when unset — an unconfigured server must not serve fabricated rows', async () => {
    const { env } = await loadEnv({ NODE_ENV: 'production', USE_MOCK_DATA: undefined });
    expect(env.USE_MOCK_DATA).toBe(false);
  });

  it('refuses to boot when mock data is requested in production', async () => {
    await expect(loadEnv({ NODE_ENV: 'production', USE_MOCK_DATA: 'true' })).rejects.toThrow(
      /USE_MOCK_DATA=true is not permitted when NODE_ENV=production/,
    );
  });

  it('still honours an explicit dev opt-in — `orb serve` and the verifiers rely on it', async () => {
    const { env } = await loadEnv({ NODE_ENV: 'development', USE_MOCK_DATA: 'true' });
    expect(env.USE_MOCK_DATA).toBe(true);
  });

  it('rejects a typo instead of silently falling through to false', async () => {
    await expect(loadEnv({ NODE_ENV: 'development', USE_MOCK_DATA: 'flase' })).rejects.toThrow(
      /Invalid environment variables/,
    );
  });
});
