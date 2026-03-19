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

// DeepAgent exports (require @almadar-io/agent as optional peer dependency)
// These are re-exported lazily — they throw at call time if agent is not installed.
export async function getMemoryManager(...args: unknown[]) {
  const m = await import('./deepagent/memory.js');
  return m.getMemoryManager(...args as []);
}
export async function resetMemoryManager() {
  const m = await import('./deepagent/memory.js');
  return m.resetMemoryManager();
}
export async function getSessionManager(...args: unknown[]) {
  const m = await import('./deepagent/session.js');
  return m.getSessionManager(...args as []);
}
export async function resetSessionManager() {
  const m = await import('./deepagent/session.js');
  return m.resetSessionManager();
}
export async function createServerSkillAgent(options: Record<string, unknown>) {
  const m = await import('./deepagent/skill-agent.js');
  return m.createServerSkillAgent(options as Parameters<typeof m.createServerSkillAgent>[0]);
}

// Multi-user middleware (requires @almadar-io/agent)
export async function multiUserMiddleware(req: unknown, res: unknown, next: unknown) {
  const m = await import('./middleware/multi-user.js');
  return m.multiUserMiddleware(req as Parameters<typeof m.multiUserMiddleware>[0], res as Parameters<typeof m.multiUserMiddleware>[1], next as Parameters<typeof m.multiUserMiddleware>[2]);
}
export async function verifyFirebaseAuth(req: unknown, res: unknown, next: unknown) {
  const m = await import('./middleware/multi-user.js');
  return m.verifyFirebaseAuth(req as Parameters<typeof m.verifyFirebaseAuth>[0], res as Parameters<typeof m.verifyFirebaseAuth>[1], next as Parameters<typeof m.verifyFirebaseAuth>[2]);
}

// WebSocket state sync (requires @almadar-io/agent)
export async function setupStateSyncWebSocket(io: unknown) {
  const m = await import('./websocket/state-sync.js');
  return m.setupStateSyncWebSocket(io as Parameters<typeof m.setupStateSyncWebSocket>[0]);
}

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

// Route exports (requires @almadar-io/agent)
export async function observabilityRouter() {
  const m = await import('./routes/observability.js');
  return m.default;
}
