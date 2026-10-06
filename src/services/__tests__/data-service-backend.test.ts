import { describe, it, expect, afterEach, vi } from 'vitest';

const load = async (vars: Record<string, string | undefined>) => {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else vi.stubEnv(key, value);
  }
  return import('../DataService.js');
};

describe('getDataService backend selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('serves the seeded mock singleton when the mock backend is declared', async () => {
    const { getDataService, seedMockData } = await load({ NODE_ENV: 'development', USE_MOCK_DATA: 'true', DATA_BACKEND: undefined });
    seedMockData([{ name: 'Task', fields: [{ name: 'title', type: 'string' }], seedCount: 3 }]);
    const rows = await getDataService().list<{ id: string }>('Task');
    expect(rows).toHaveLength(3);
  });

  it('DATA_BACKEND=mock selects the mock backend and seeds it', async () => {
    const { getDataService, seedMockData } = await load({ NODE_ENV: 'development', USE_MOCK_DATA: undefined, DATA_BACKEND: 'mock' });
    seedMockData([{ name: 'Task', fields: [{ name: 'title', type: 'string' }], seedCount: 2 }]);
    expect(await getDataService().list('Task')).toHaveLength(2);
  });

  it('refuses to boot with mock in production, via the db env mapping', async () => {
    await expect(load({ NODE_ENV: 'production', USE_MOCK_DATA: 'true' })).rejects.toThrow(/USE_MOCK_DATA=true is not permitted/);
  });

  it('postgres without DATABASE_URL fails at boot with the declared error', async () => {
    await expect(load({ NODE_ENV: 'development', DATA_BACKEND: 'postgres', DATABASE_URL: undefined, USE_MOCK_DATA: undefined })).rejects.toThrow(
      'DATA_BACKEND=postgres requires DATABASE_URL to be set',
    );
  });
});
