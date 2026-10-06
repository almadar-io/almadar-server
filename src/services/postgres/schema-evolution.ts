import { applySchemaEvolution as applyDbSchemaEvolution, type EvolutionPolicy, type EvolutionReport, type SqlExecutor } from '@almadar/db';
import type { Entity } from '@almadar/core';
import { env } from '../../lib/env.js';

export function applySchemaEvolution(
  executor: SqlExecutor,
  entities: Entity[],
  policy: EvolutionPolicy,
): Promise<EvolutionReport> {
  return applyDbSchemaEvolution(executor, entities, policy, {
    production: env.NODE_ENV === 'production',
    destructiveOptIn: env.PG_MIGRATE_DESTRUCTIVE === 'apply',
  });
}
