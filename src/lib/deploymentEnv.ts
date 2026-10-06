import { authEnvProblems, type AuthEnv } from '@almadar/auth/server';

/**
 * Production boot check for who `@user` is and where data lives: every declared auth problem, and a
 * Firestore emulator host (which serves no real data). Throws naming each problem; a no-op outside
 * `NODE_ENV=production` (an unset NODE_ENV counts as production, as in `env.ts`).
 */
export function validateDeploymentEnv(env: AuthEnv = process.env): void {
  if ((env['NODE_ENV'] ?? 'production') !== 'production') return;
  const problems = authEnvProblems(env);
  if (env['FIRESTORE_EMULATOR_HOST']) problems.push('FIRESTORE_EMULATOR_HOST is set: the Firestore emulator is for local dev only');
  if (problems.length > 0) {
    throw new Error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
  }
}
