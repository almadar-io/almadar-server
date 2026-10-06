import { z } from 'zod';
import dotenv from 'dotenv';
import { createLogger } from '@almadar/logger';
import { persistenceSpecFromEnv, type PersistenceSpec } from '@almadar/db/backend';

// Load environment variables
dotenv.config();

const envLog = createLogger('almadar:server:env');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
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
  // Data backend selection — 'firebase' (default), 'postgres', 'couchdb', or 'mock' (USE_MOCK_DATA legacy flag wins).
  DATA_BACKEND: z.enum(['mock', 'firebase', 'postgres', 'couchdb']).default('firebase'),
  // CouchDB — only required when DATA_BACKEND=couchdb.
  COUCHDB_URL: z.string().optional(),
  PGPOOL_MAX: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  // Schema-evolution policy — 'refuse' unless the host explicitly opts in.
  // Same fail-closed idiom as the auth bypass: an unset flag never applies
  // destructive DDL (DROP COLUMN / retype / CHECK-narrow) in any environment;
  // in production a destructive diff without this flag aborts with an error.
  PG_MIGRATE_DESTRUCTIVE: z.enum(['apply', 'refuse']).default('refuse'),
  
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

// The data-backend selection is declared once, in `@almadar/db`: it maps DATA_BACKEND /
// USE_MOCK_DATA / DATABASE_URL / PGPOOL_MAX / COUCHDB_URL, refuses mock under
// NODE_ENV=production and throws on missing backend config. Evaluated at boot so a
// misconfigured production server fails before it serves anything.
export const persistenceSpec: PersistenceSpec = persistenceSpecFromEnv(process.env);
