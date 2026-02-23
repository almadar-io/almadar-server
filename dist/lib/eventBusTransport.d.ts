/**
 * EventBus Transport Layer — Pluggable backends for distributed event communication
 *
 * Transports enable emit/listen to work across processes:
 * - InMemoryTransport: Default, same-process (no-op relay)
 * - RedisTransport: Redis pub/sub for cross-process communication
 *
 * The DistributedEventBus wraps the existing EventBus and relays events
 * through a transport. Local listeners still fire immediately; the transport
 * handles cross-process delivery.
 *
 * @packageDocumentation
 */
import { type EventLogEntry } from './eventBus.js';
/**
 * Message shape sent over the transport wire.
 */
export interface TransportMessage {
    event: string;
    payload: unknown;
    meta?: Record<string, unknown>;
    /** Source instance ID to prevent echo loops */
    sourceId: string;
    timestamp: number;
}
/**
 * Callback invoked when a message arrives from another process.
 */
export type TransportReceiver = (message: TransportMessage) => void;
/**
 * Pluggable transport interface for cross-process event delivery.
 */
export interface IEventBusTransport {
    /** Publish a message to the transport */
    publish(message: TransportMessage): Promise<void>;
    /** Subscribe to incoming messages from other processes */
    subscribe(receiver: TransportReceiver): Promise<void>;
    /** Unsubscribe and clean up resources */
    close(): Promise<void>;
}
/**
 * No-op transport for single-process mode.
 * Events stay in the local EventBus only.
 */
export declare class InMemoryTransport implements IEventBusTransport {
    publish(): Promise<void>;
    subscribe(): Promise<void>;
    close(): Promise<void>;
}
/**
 * Options for RedisTransport.
 */
export interface RedisTransportOptions {
    /** Redis channel name for event relay (default: 'almadar:events') */
    channel?: string;
    /**
     * Publish function — sends serialized message to Redis channel.
     * This is injected so we don't depend on a specific Redis client library.
     */
    publishFn: (channel: string, message: string) => Promise<void>;
    /**
     * Subscribe function — registers a callback for messages on a Redis channel.
     * This is injected so we don't depend on a specific Redis client library.
     */
    subscribeFn: (channel: string, callback: (message: string) => void) => Promise<void>;
    /**
     * Unsubscribe/cleanup function.
     */
    closeFn?: () => Promise<void>;
}
/**
 * Redis pub/sub transport for cross-process event delivery.
 *
 * Uses dependency-injected publish/subscribe functions so the transport
 * is not coupled to any specific Redis client library (ioredis, redis, etc.).
 *
 * Usage with ioredis:
 * ```typescript
 * import Redis from 'ioredis';
 * const pub = new Redis(process.env.REDIS_URL);
 * const sub = new Redis(process.env.REDIS_URL);
 *
 * const transport = new RedisTransport({
 *   publishFn: (ch, msg) => pub.publish(ch, msg).then(() => {}),
 *   subscribeFn: (ch, cb) => { sub.subscribe(ch); sub.on('message', (_, msg) => cb(msg)); return Promise.resolve(); },
 *   closeFn: async () => { await pub.quit(); await sub.quit(); },
 * });
 * ```
 */
export declare class RedisTransport implements IEventBusTransport {
    private channel;
    private publishFn;
    private subscribeFn;
    private closeFn;
    constructor(options: RedisTransportOptions);
    publish(message: TransportMessage): Promise<void>;
    subscribe(receiver: TransportReceiver): Promise<void>;
    close(): Promise<void>;
}
/**
 * DistributedEventBus wraps the existing EventBus and relays events
 * through a pluggable transport for cross-process communication.
 *
 * - Local emit → fires local listeners + publishes to transport
 * - Transport message received → fires local listeners (skips re-publish)
 *
 * Drop-in replacement for EventBus — same API, same singleton pattern.
 */
export declare class DistributedEventBus {
    private localBus;
    private transport;
    private instanceId;
    private isRelaying;
    constructor(options?: {
        debug?: boolean;
        transport?: IEventBusTransport;
    });
    /**
     * Initialize the transport subscription. Call once at startup.
     */
    connect(): Promise<void>;
    /**
     * Emit an event locally and publish to transport for other processes.
     */
    emit(event: string, payload?: unknown, meta?: Record<string, unknown>): void;
    /** Subscribe to an event */
    on(event: string, handler: (payload: unknown, meta?: Record<string, unknown>) => void): () => void;
    /** Unsubscribe from an event */
    off(event: string, handler: (payload: unknown, meta?: Record<string, unknown>) => void): void;
    /** Get recent events (dev diagnostics) */
    getRecentEvents(limit?: number): EventLogEntry[];
    /** Clear event log */
    clearEventLog(): void;
    /** Get listener counts */
    getListenerCounts(): Record<string, number>;
    /** Clear all listeners and log */
    clear(): void;
    /** Disconnect transport */
    disconnect(): Promise<void>;
    /** Get the instance ID (for debugging) */
    getInstanceId(): string;
}
//# sourceMappingURL=eventBusTransport.d.ts.map