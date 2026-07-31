import { z } from 'zod';
import dotenv from 'dotenv';
import { createLogger } from '@almadar/logger';

// Load environment variables
dotenv.config();

const envLog = createLogger('almadar:server:env');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  // Auth dev-bypass is OFF unless explicitly opted in. Never key the bypass on
  // NODE_ENV — an unset/misconfigured env must fail closed.
  ALLOW_DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false'),
  PORT: z
    .string()
    .default('3030')
    .transform((val) => parseInt(val, 10)),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((val) => (val.includes(',') ? val.split(',').map((s) => s.trim()) : val)),
  
  // Database (Prisma/SQL) - optional
  DATABASE_URL: z.string().optional(),
  
  // Firebase/Firestore configuration
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  
  // API configuration
  API_PREFIX: z.string().default('/api'),

  // Mock data is OFF unless explicitly opted in — same fail-closed rule as the
  // auth bypass above. An unset flag must never silently serve fabricated,
  // non-persisted rows from a server that believes it is in production.
  // `z.enum` (not `z.string`) so a typo hard-fails at boot instead of falling
  // through `v === 'true'` to a value nobody chose.
  USE_MOCK_DATA: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  MOCK_SEED: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  envLog.error('Invalid environment variables', { fieldErrors: parsed.error.flatten().fieldErrors });
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;

// Mock data in production is never a configuration anyone intends: every write
// is accepted with a 2xx and lost on restart, and every read is fabricated.
// Refuse the boot rather than serve it — the same fail-closed posture as
// ALLOW_DEV_AUTH_BYPASS, which is meaningless if the data underneath is fake.
if (env.NODE_ENV === 'production' && env.USE_MOCK_DATA) {
  envLog.error('USE_MOCK_DATA=true with NODE_ENV=production — refusing to start', {
    reason: 'mock rows are in-memory and non-persisted; a production server must not serve them',
    fix: 'unset USE_MOCK_DATA (it now defaults to false), or set NODE_ENV=development for local runs',
  });
  throw new Error(
    '@almadar/server: USE_MOCK_DATA=true is not permitted when NODE_ENV=production. ' +
      'Unset USE_MOCK_DATA to use the real data source, or set NODE_ENV=development.',
  );
}
