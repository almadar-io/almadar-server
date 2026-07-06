/**
 * @almadar/server - Shared server infrastructure for Almadar applications
 *
 * This package provides:
 * - Database utilities (Firebase/Firestore)
 * - Event bus for cross-trait communication
 * - Express middleware (auth, error handling, validation)
 * - Data services (mock and production)
 * - Query filter utilities
 *
 * @packageDocumentation
 */

// Lib exports
export { env } from './lib/env.js';
export { logger } from './lib/logger.js';
// Namespaced structured logger — same shape as the runtime + UI loggers.
// Generated server handlers use this for the persist/emit hot path so the
// `[almadar:server:effects]` lines show up in the verifier's `[almadar:*]`
// stdout filter (orbital-verify-unified server-lifecycle.ts).
export { createLogger, type Logger, type LogData } from '@almadar/logger';
export { EventBus, getServerEventBus, resetServerEventBus, emitEntityEvent, type EventLogEntry } from './lib/eventBus.js';
export {
  DistributedEventBus,
  InMemoryTransport,
  RedisTransport,
  type IEventBusTransport,
  type TransportMessage,
  type TransportReceiver,
  type RedisTransportOptions,
} from './lib/eventBusTransport.js';
export {
  EventPersistence,
  InMemoryEventStore,
  type PersistedEvent,
  type EventQuery,
  type EventPersistenceOptions,
  type IEventStore,
} from './lib/eventPersistence.js';
export { debugEventsRouter } from './lib/debugRouter.js';
export { initializeFirebase, getFirestore, getAuth, admin, db } from './lib/db.js';
export {
  setupEventBroadcast,
  getWebSocketServer,
  closeWebSocketServer,
  getConnectedClientCount,
} from './lib/websocket.js';
export {
  setupSSE,
  sendSSEEvent,
  formatSSEEvent,
  sendSSEDone,
  closeSSE,
  type SSEEvent,
} from './lib/sse.js';

// Middleware exports
export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from './middleware/errorHandler.js';
export { validateBody, validateQuery, validateParams } from './middleware/validation.js';
export { authenticateFirebase } from './middleware/authenticateFirebase.js';

// Services exports
export {
  MockDataService,
  getMockDataService,
  resetMockDataService,
  type FieldSchema,
  type EntitySchema,
} from './services/MockDataService.js';
export {
  getDataService,
  resetDataService,
  seedMockData,
  type DataService,
  type EntitySeedConfig,
  type PaginationOptions,
  type PaginatedResult,
} from './services/DataService.js';
export {
  getSubstrateService,
  setSubstrateService,
  resetSubstrateService,
  type SubstrateService,
} from './services/substrate.js';

// Compat re-exports — generated project code imports these constant names.
// They are now lazy getters; usage like `dataService.getById(...)` works
// because the function IS the getter (called at import time in a Proxy).
import { getMockDataService } from './services/MockDataService.js';
import { getDataService } from './services/DataService.js';
import { getServerEventBus } from './lib/eventBus.js';

/** @deprecated Use getDataService() instead */
export const dataService = new Proxy({} as ReturnType<typeof getDataService>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDataService(), prop, receiver);
  },
});

/** @deprecated Use getMockDataService() instead */
export const mockDataService = new Proxy({} as ReturnType<typeof getMockDataService>, {
  get(_target, prop, receiver) {
    return Reflect.get(getMockDataService(), prop, receiver);
  },
});

/** @deprecated Use getServerEventBus() instead */
export const serverEventBus = new Proxy({} as ReturnType<typeof getServerEventBus>, {
  get(_target, prop, receiver) {
    return Reflect.get(getServerEventBus(), prop, receiver);
  },
});

// Stores exports
export {
  toFirestoreFormat,
  fromFirestoreFormat,
  SchemaStore,
  SnapshotStore,
  ChangeSetStore,
  ValidationStore,
  SchemaProtectionService,
  getRuntimeEntity,
  clearRuntimeEntity,
  resetRuntimeEntityStore,
} from './stores/index.js';

// Utils exports
export {
  parseQueryFilters,
  applyFiltersToQuery,
  extractPaginationParams,
  type ParsedFilter,
  type FirestoreWhereFilterOp,
  type PaginationParams,
} from './utils/queryFilters.js';

// ─── Rabit compatibility exports (replaces old @almadar-io/agent surface) ────

export {
  getOrbitalMemory,
  resetOrbitalMemory,
} from './deepagent/memory.js';
export {
  getSessionStore,
  resetSessionStore,
} from './deepagent/session.js';
export {
  createServerSkillAgent,
} from './deepagent/skill-agent.js';
export type {
  SkillAgentResult,
  SkillAgentOptions,
} from './deepagent/skill-agent.js';

export {
  multiUserMiddleware,
  verifyFirebaseAuth,
} from './middleware/multi-user.js';

export {
  setupStateSyncWebSocket,
} from './websocket/state-sync.js';

// Service Discovery exports
export {
  ServiceDiscovery,
  InMemoryServiceRegistry,
  type ServiceRegistration,
  type ServiceRegistryOptions,
  type IServiceRegistry,
} from './lib/serviceDiscovery.js';

// Contract exports
export type {
  DataServiceActions,
  DataServiceContract,
  EventBusActions,
  EventBusServiceContract,
  ServiceDiscoveryActions,
  ServiceDiscoveryContract,
  ServerServiceContracts,
} from './contracts.js';

// Route exports
export async function observabilityRouter(): Promise<import('express').Router> {
  const m = await import('./routes/observability.js');
  return m.default;
}
