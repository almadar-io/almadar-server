/**
 * Event Persistence Layer — Optional durable event storage for replay and debugging
 *
 * Wraps the EventBus to persist emitted events. Supports:
 * - In-memory storage (default, for development)
 * - Configurable retention (TTL-based cleanup)
 * - Replay API: query events by name, time range, or source
 * - Required for saga compensation and distributed debugging
 *
 * @packageDocumentation
 */
/** Persisted event record */
export interface PersistedEvent {
    /** Unique event ID */
    id: string;
    /** Event name (e.g., 'LLM_RESPONSE') */
    eventName: string;
    /** Event payload */
    payload: unknown;
    /** Source orbital/service that emitted this event */
    source: string;
    /** Timestamp when event was emitted */
    timestamp: number;
    /** Trace ID for distributed tracing correlation */
    traceId: string;
    /** Optional metadata */
    meta?: Record<string, unknown>;
}
/** Query filters for replaying events */
export interface EventQuery {
    /** Filter by event name (exact match) */
    eventName?: string;
    /** Filter by source orbital */
    source?: string;
    /** Filter by trace ID */
    traceId?: string;
    /** Events after this timestamp */
    after?: number;
    /** Events before this timestamp */
    before?: number;
    /** Maximum number of events to return */
    limit?: number;
    /** Sort order */
    order?: 'asc' | 'desc';
}
/** Options for the event persistence layer */
export interface EventPersistenceOptions {
    /** Whether persistence is enabled (default: true) */
    enabled?: boolean;
    /** TTL in milliseconds for event retention (default: 24 hours) */
    retentionMs?: number;
    /** Maximum events to store (default: 10000) */
    maxEvents?: number;
    /** Cleanup interval in milliseconds (default: 5 minutes) */
    cleanupIntervalMs?: number;
    /** Default source identifier */
    defaultSource?: string;
}
/** Storage backend interface */
export interface IEventStore {
    /** Persist an event */
    store(event: PersistedEvent): Promise<void>;
    /** Query events */
    query(filters: EventQuery): Promise<PersistedEvent[]>;
    /** Get a single event by ID */
    get(id: string): Promise<PersistedEvent | null>;
    /** Delete events older than timestamp */
    deleteOlderThan(timestamp: number): Promise<number>;
    /** Get total event count */
    count(): Promise<number>;
    /** Clear all stored events */
    clear(): Promise<void>;
}
/**
 * In-memory event store for development and testing.
 */
export declare class InMemoryEventStore implements IEventStore {
    private events;
    private index;
    store(event: PersistedEvent): Promise<void>;
    query(filters: EventQuery): Promise<PersistedEvent[]>;
    get(id: string): Promise<PersistedEvent | null>;
    deleteOlderThan(timestamp: number): Promise<number>;
    count(): Promise<number>;
    clear(): Promise<void>;
}
/**
 * Event persistence layer that can be attached to an EventBus.
 *
 * Usage:
 * ```typescript
 * const persistence = new EventPersistence({ retentionMs: 3600000 });
 * persistence.startCleanup();
 *
 * // Persist an event
 * await persistence.persist('LLM_RESPONSE', { content: '...' }, { source: 'llm-service' });
 *
 * // Replay events
 * const events = await persistence.replay({ eventName: 'LLM_RESPONSE', limit: 10 });
 *
 * // Stop cleanup on shutdown
 * persistence.stopCleanup();
 * ```
 */
export declare class EventPersistence {
    private store;
    private options;
    private cleanupTimer;
    constructor(options?: EventPersistenceOptions, store?: IEventStore);
    /**
     * Persist an event.
     */
    persist(eventName: string, payload: unknown, meta?: {
        source?: string;
        traceId?: string;
        [key: string]: unknown;
    }): Promise<PersistedEvent>;
    /**
     * Replay events matching the query filters.
     */
    replay(query: EventQuery): Promise<PersistedEvent[]>;
    /**
     * Get a single event by ID.
     */
    getEvent(id: string): Promise<PersistedEvent | null>;
    /**
     * Get event count.
     */
    getEventCount(): Promise<number>;
    /**
     * Run cleanup — delete events older than retention period.
     */
    cleanup(): Promise<number>;
    /**
     * Start periodic cleanup timer.
     */
    startCleanup(): void;
    /**
     * Stop periodic cleanup timer.
     */
    stopCleanup(): void;
    /**
     * Clear all persisted events.
     */
    clear(): Promise<void>;
    /**
     * Get the underlying store (for testing or custom queries).
     */
    getStore(): IEventStore;
}
//# sourceMappingURL=eventPersistence.d.ts.map