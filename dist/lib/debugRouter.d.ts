/**
 * Debug Events Router
 *
 * Provides diagnostic endpoints for inspecting the server EventBus.
 * Only active when NODE_ENV=development.
 *
 * Endpoints:
 *   GET    /event-log   - Recent emitted events with listener counts
 *   DELETE /event-log   - Clear the event log
 *   GET    /listeners   - Registered listener counts per event
 *
 * @packageDocumentation
 */
import { Router } from 'express';
/**
 * Creates an Express router with debug endpoints for the server EventBus.
 * Returns a no-op router in production (no routes registered).
 */
export declare function debugEventsRouter(): Router;
//# sourceMappingURL=debugRouter.d.ts.map