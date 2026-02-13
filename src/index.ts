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
export { EventBus, serverEventBus, emitEntityEvent, type EventLogEntry } from './lib/eventBus.js';
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
  mockDataService,
  MockDataService,
  type FieldSchema,
  type EntitySchema,
} from './services/MockDataService.js';
export {
  dataService,
  seedMockData,
  type DataService,
  type EntitySeedConfig,
  type PaginationOptions,
  type PaginatedResult,
} from './services/DataService.js';

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

// DeepAgent exports (GAP implementations)
export {
  getMemoryManager,
  resetMemoryManager,
} from './deepagent/memory.js';
export {
  getSessionManager,
  resetSessionManager,
} from './deepagent/session.js';
export {
  createServerSkillAgent,
  getMemoryManager as getAgentMemoryManager,
  getSessionManager as getAgentSessionManager,
} from './deepagent/skill-agent.js';

// Multi-user middleware exports
export {
  multiUserMiddleware,
  verifyFirebaseAuth,
} from './middleware/multi-user.js';

// WebSocket exports
export { setupStateSyncWebSocket } from './websocket/state-sync.js';

// Route exports
export { default as observabilityRouter } from './routes/observability.js';
