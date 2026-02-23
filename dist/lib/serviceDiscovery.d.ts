/**
 * Service Discovery — Registry for service orbital instances
 *
 * Enables distributed event routing by tracking which services are running,
 * what events they emit/listen for, and where they can be reached.
 *
 * Supports:
 * - In-memory registry (default, single-process)
 * - Registration/deregistration with heartbeat
 * - Event routing: find services that listen for a given event
 * - Health tracking via TTL-based expiry
 *
 * @packageDocumentation
 */
/** Service registration record */
export interface ServiceRegistration {
    /** Service name (from .orb schema name) */
    name: string;
    /** Unique instance ID */
    instanceId: string;
    /** Host where the service is running */
    host: string;
    /** Port number */
    port: number;
    /** Hash of the .orb schema for version tracking */
    orbHash: string;
    /** Events this service emits */
    emits: string[];
    /** Events this service listens for */
    listens: string[];
    /** Registration timestamp */
    registeredAt: number;
    /** Last heartbeat timestamp */
    lastHeartbeat: number;
    /** Service status */
    status: 'starting' | 'ready' | 'degraded' | 'stopping';
    /** Optional metadata */
    metadata?: Record<string, unknown>;
}
/** Options for the service registry */
export interface ServiceRegistryOptions {
    /** TTL for service registrations in ms (default: 60000) */
    heartbeatTtlMs?: number;
    /** Cleanup interval for expired registrations (default: 30000) */
    cleanupIntervalMs?: number;
}
/** Service registry interface for pluggable backends */
export interface IServiceRegistry {
    /** Register a service */
    register(service: ServiceRegistration): Promise<void>;
    /** Deregister a service */
    deregister(instanceId: string): Promise<void>;
    /** Update heartbeat for a service */
    heartbeat(instanceId: string): Promise<void>;
    /** Update service status */
    updateStatus(instanceId: string, status: ServiceRegistration['status']): Promise<void>;
    /** Get all registered services */
    getAll(): Promise<ServiceRegistration[]>;
    /** Get services by name */
    getByName(name: string): Promise<ServiceRegistration[]>;
    /** Find services that listen for a given event */
    findListeners(event: string): Promise<ServiceRegistration[]>;
    /** Find services that emit a given event */
    findEmitters(event: string): Promise<ServiceRegistration[]>;
    /** Remove expired registrations */
    cleanup(ttlMs: number): Promise<number>;
}
/**
 * In-memory service registry for single-process and development mode.
 */
export declare class InMemoryServiceRegistry implements IServiceRegistry {
    private services;
    register(service: ServiceRegistration): Promise<void>;
    deregister(instanceId: string): Promise<void>;
    heartbeat(instanceId: string): Promise<void>;
    updateStatus(instanceId: string, status: ServiceRegistration['status']): Promise<void>;
    getAll(): Promise<ServiceRegistration[]>;
    getByName(name: string): Promise<ServiceRegistration[]>;
    findListeners(event: string): Promise<ServiceRegistration[]>;
    findEmitters(event: string): Promise<ServiceRegistration[]>;
    cleanup(ttlMs: number): Promise<number>;
}
/**
 * Service discovery manager that wraps a registry backend.
 *
 * Usage:
 * ```typescript
 * const discovery = new ServiceDiscovery();
 * discovery.startCleanup();
 *
 * // Register a service
 * await discovery.register({
 *   name: 'LLMService',
 *   instanceId: 'llm-001',
 *   host: 'localhost',
 *   port: 3001,
 *   orbHash: 'abc123',
 *   emits: ['LLM_RESPONSE', 'LLM_READY'],
 *   listens: ['AGENT_LLM_REQUEST'],
 * });
 *
 * // Find who can handle an event
 * const listeners = await discovery.findListeners('AGENT_LLM_REQUEST');
 * ```
 */
export declare class ServiceDiscovery {
    private registry;
    private options;
    private cleanupTimer;
    constructor(options?: ServiceRegistryOptions, registry?: IServiceRegistry);
    /**
     * Register a service with the registry.
     */
    register(service: Omit<ServiceRegistration, 'registeredAt' | 'lastHeartbeat' | 'status'> & {
        status?: ServiceRegistration['status'];
    }): Promise<void>;
    /**
     * Deregister a service.
     */
    deregister(instanceId: string): Promise<void>;
    /**
     * Send heartbeat for a service.
     */
    heartbeat(instanceId: string): Promise<void>;
    /**
     * Mark a service as ready.
     */
    markReady(instanceId: string): Promise<void>;
    /**
     * Mark a service as degraded.
     */
    markDegraded(instanceId: string): Promise<void>;
    /**
     * Find all services that listen for a given event.
     */
    findListeners(event: string): Promise<ServiceRegistration[]>;
    /**
     * Find all services that emit a given event.
     */
    findEmitters(event: string): Promise<ServiceRegistration[]>;
    /**
     * Get all registered services.
     */
    getAll(): Promise<ServiceRegistration[]>;
    /**
     * Get the full event topology (who emits what, who listens for what).
     */
    getEventTopology(): Promise<{
        events: Array<{
            event: string;
            emitters: string[];
            listeners: string[];
        }>;
    }>;
    /**
     * Start periodic cleanup of expired services.
     */
    startCleanup(): void;
    /**
     * Stop periodic cleanup.
     */
    stopCleanup(): void;
    /**
     * Get the underlying registry (for testing).
     */
    getRegistry(): IServiceRegistry;
}
//# sourceMappingURL=serviceDiscovery.d.ts.map