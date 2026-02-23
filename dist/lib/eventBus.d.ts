/**
 * Server EventBus - Singleton for server-side cross-trait communication
 *
 * This EventBus enables:
 * - Server-side trait event emission after CRUD operations
 * - Server-side trait listeners responding to events
 * - Cross-client event broadcast via WebSocket
 *
 * @packageDocumentation
 */
type EventHandler = (payload: unknown, meta?: Record<string, unknown>) => void;
export interface EventLogEntry {
    event: string;
    payload: unknown;
    timestamp: number;
    listenerCount: number;
    wildcardListenerCount: number;
}
/**
 * Simple EventBus implementation for server-side events
 */
export declare class EventBus {
    private handlers;
    private debug;
    private eventLog;
    constructor(options?: {
        debug?: boolean;
    });
    on(event: string, handler: EventHandler): () => void;
    off(event: string, handler: EventHandler): void;
    emit(event: string, payload?: unknown, meta?: Record<string, unknown>): void;
    getRecentEvents(limit?: number): EventLogEntry[];
    clearEventLog(): void;
    getListenerCounts(): Record<string, number>;
    clear(): void;
}
/**
 * Singleton EventBus instance for server-side event communication.
 */
export declare const serverEventBus: EventBus;
/**
 * Type-safe event emission helper
 */
export declare function emitEntityEvent(entityType: string, action: 'CREATED' | 'UPDATED' | 'DELETED', payload: Record<string, unknown>): void;
export {};
//# sourceMappingURL=eventBus.d.ts.map