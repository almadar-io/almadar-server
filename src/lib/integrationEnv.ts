/**
 * Boot-time credential check + health checks for the integrations an app
 * actually invokes. The generated server passes `invokedServices` from its
 * emitted `services/clients.ts`; required env vars come from the services
 * registry (`@almadar/core/patterns/services-registry.json`).
 *
 * Production: a missing REQUIRED credential throws at boot (fail-fast — the
 * `validateEnv`/`ALMADAR_API_KEY_SALT` precedent). Development: it warns.
 * Mock modes (`ALMADAR_INTEGRATIONS_MODE=mock`, `USE_MOCK_DATA=true`) skip
 * the check — mocked integrations read no credentials.
 *
 * @packageDocumentation
 */

import { createRequire } from 'node:module';
import { createLogger } from '@almadar/logger';

const integrationLog = createLogger('almadar:server:integration-env');

interface ServiceCredential {
  envVar: string;
  required: boolean;
  description: string;
}

export interface IntegrationHealthCheck {
  name: string;
  status: 'healthy' | 'degraded';
  detail: string;
  timestamp: number;
}

function loadRegistryCredentials(): Record<string, ServiceCredential[]> {
  try {
    const esmRequire = createRequire(import.meta.url);
    const registry = esmRequire('@almadar/core/patterns/services-registry.json') as {
      services: Record<string, { credentials?: ServiceCredential[] }>;
    };
    const result: Record<string, ServiceCredential[]> = {};
    for (const [name, entry] of Object.entries(registry.services)) {
      result[name] = entry.credentials ?? [];
    }
    return result;
  } catch {
    return {};
  }
}

function integrationsMocked(): boolean {
  return (
    process.env.ALMADAR_INTEGRATIONS_MODE === 'mock' || process.env.USE_MOCK_DATA === 'true'
  );
}

function missingRequiredByService(
  services: readonly string[],
): Array<{ service: string; envVar: string; description: string }> {
  const registry = loadRegistryCredentials();
  const missing: Array<{ service: string; envVar: string; description: string }> = [];
  for (const service of services) {
    for (const cred of registry[service] ?? []) {
      if (cred.required && !process.env[cred.envVar]) {
        missing.push({ service, envVar: cred.envVar, description: cred.description });
      }
    }
  }
  return missing;
}

const healthServices: string[] = [];

/**
 * Validate that every REQUIRED credential of the given invoked services is
 * present in the environment. Call once at server boot with the generated
 * `invokedServices`. Also registers the services for `/health` reporting.
 */
export function validateIntegrationEnv(services: readonly string[]): void {
  healthServices.splice(0, healthServices.length, ...services);

  if (services.length === 0 || integrationsMocked()) {
    return;
  }

  const missing = missingRequiredByService(services);
  if (missing.length === 0) {
    integrationLog.info('integration-credentials-present', { services: [...services] });
    return;
  }

  const summary = missing.map((m) => `${m.service}: ${m.envVar} (${m.description})`);
  if (process.env.NODE_ENV === 'production') {
    integrationLog.error('missing-required-integration-credentials', { missing: summary });
    throw new Error(
      `Missing required integration credentials — refusing to start: ${summary.join('; ')}. ` +
        'See SECRETS.md in the app root for provisioning commands.',
    );
  }
  integrationLog.warn('missing-required-integration-credentials', { missing: summary });
}

/**
 * Per-integration health entries for the `/health` route, computed from the
 * services registered by `validateIntegrationEnv`. A service missing a
 * required credential reports `degraded`; mock mode reports it explicitly so
 * a green check can never mean "mocked".
 */
export function integrationHealthChecks(): IntegrationHealthCheck[] {
  const now = Date.now();
  if (healthServices.length === 0) {
    return [];
  }
  if (integrationsMocked()) {
    return healthServices.map((service) => ({
      name: `integration:${service}`,
      status: 'degraded' as const,
      detail: 'mocked (ALMADAR_INTEGRATIONS_MODE=mock or USE_MOCK_DATA=true)',
      timestamp: now,
    }));
  }
  const missing = missingRequiredByService(healthServices);
  return healthServices.map((service) => {
    const misses = missing.filter((m) => m.service === service);
    return {
      name: `integration:${service}`,
      status: misses.length === 0 ? ('healthy' as const) : ('degraded' as const),
      detail:
        misses.length === 0
          ? 'required credentials present'
          : `missing: ${misses.map((m) => m.envVar).join(', ')}`,
      timestamp: now,
    };
  });
}
