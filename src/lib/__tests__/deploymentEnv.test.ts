import { describe, it, expect } from 'vitest';
import { validateDeploymentEnv } from '../deploymentEnv.js';

describe('validateDeploymentEnv', () => {
  it('outside production it never refuses', () => {
    expect(() => validateDeploymentEnv({ NODE_ENV: 'development', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).not.toThrow();
  });
  it('production with a real project boots', () => {
    expect(() => validateDeploymentEnv({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'kflow-prod' })).not.toThrow();
  });
  it('production names every problem at once', () => {
    expect(() => validateDeploymentEnv({ NODE_ENV: 'production', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }))
      .toThrow(/needs FIREBASE_PROJECT_ID[\s\S]*FIRESTORE_EMULATOR_HOST is set/);
  });
  it('control: an unset NODE_ENV counts as production', () => {
    expect(() => validateDeploymentEnv({})).toThrow(/Refusing to start in production/);
  });
});
