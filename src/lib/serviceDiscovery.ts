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

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// InMemoryServiceRegistry
// ============================================================================

/**
 * In-memory service registry for single-process and development mode.
 */
export class InMemoryServiceRegistry implements IServiceRegistry {
  private services: Map<string, ServiceRegistration> = new Map();

  async register(service: ServiceRegistration): Promise<void> {
    this.services.set(service.instanceId, {
      ...service,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    });
  }

  async deregister(instanceId: string): Promise<void> {
    this.services.delete(instanceId);
  }

  async heartbeat(instanceId: string): Promise<void> {
    const service = this.services.get(instanceId);
    if (service) {
      service.lastHeartbeat = Date.now();
    }
  }

  async updateStatus(instanceId: string, status: ServiceRegistration['status']): Promise<void> {
    const service = this.services.get(instanceId);
    if (service) {
      service.status = status;
    }
  }

  async getAll(): Promise<ServiceRegistration[]> {
    return Array.from(this.services.values());
  }

  async getByName(name: string): Promise<ServiceRegistration[]> {
    return Array.from(this.services.values()).filter(s => s.name === name);
  }

  async findListeners(event: string): Promise<ServiceRegistration[]> {
    return Array.from(this.services.values()).filter(
      s => s.listens.includes(event) && s.status !== 'stopping',
    );
  }

  async findEmitters(event: string): Promise<ServiceRegistration[]> {
    return Array.from(this.services.values()).filter(
      s => s.emits.includes(event) && s.status !== 'stopping',
    );
  }

  async cleanup(ttlMs: number): Promise<number> {
    const cutoff = Date.now() - ttlMs;
    let removed = 0;
    for (const [id, service] of this.services) {
      if (service.lastHeartbeat < cutoff) {
        this.services.delete(id);
        removed++;
      }
    }
    return removed;
  }
}

// ============================================================================
// ServiceDiscovery (High-Level API)
// ============================================================================

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
export class ServiceDiscovery {
  private registry: IServiceRegistry;
  private options: Required<ServiceRegistryOptions>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: ServiceRegistryOptions, registry?: IServiceRegistry) {
    this.options = {
      heartbeatTtlMs: options?.heartbeatTtlMs ?? 60000,
      cleanupIntervalMs: options?.cleanupIntervalMs ?? 30000,
    };
    this.registry = registry ?? new InMemoryServiceRegistry();
  }

  /**
   * Register a service with the registry.
   */
  async register(service: Omit<ServiceRegistration, 'registeredAt' | 'lastHeartbeat' | 'status'> & { status?: ServiceRegistration['status'] }): Promise<void> {
    await this.registry.register({
      ...service,
      status: service.status ?? 'starting',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    });
  }

  /**
   * Deregister a service.
   */
  async deregister(instanceId: string): Promise<void> {
    await this.registry.deregister(instanceId);
  }

  /**
   * Send heartbeat for a service.
   */
  async heartbeat(instanceId: string): Promise<void> {
    await this.registry.heartbeat(instanceId);
  }

  /**
   * Mark a service as ready.
   */
  async markReady(instanceId: string): Promise<void> {
    await this.registry.updateStatus(instanceId, 'ready');
  }

  /**
   * Mark a service as degraded.
   */
  async markDegraded(instanceId: string): Promise<void> {
    await this.registry.updateStatus(instanceId, 'degraded');
  }

  /**
   * Find all services that listen for a given event.
   */
  async findListeners(event: string): Promise<ServiceRegistration[]> {
    return this.registry.findListeners(event);
  }

  /**
   * Find all services that emit a given event.
   */
  async findEmitters(event: string): Promise<ServiceRegistration[]> {
    return this.registry.findEmitters(event);
  }

  /**
   * Get all registered services.
   */
  async getAll(): Promise<ServiceRegistration[]> {
    return this.registry.getAll();
  }

  /**
   * Get the full event topology (who emits what, who listens for what).
   */
  async getEventTopology(): Promise<{
    events: Array<{
      event: string;
      emitters: string[];
      listeners: string[];
    }>;
  }> {
    const services = await this.registry.getAll();
    const eventMap = new Map<string, { emitters: Set<string>; listeners: Set<string> }>();

    for (const service of services) {
      for (const event of service.emits) {
        if (!eventMap.has(event)) eventMap.set(event, { emitters: new Set(), listeners: new Set() });
        eventMap.get(event)!.emitters.add(service.name);
      }
      for (const event of service.listens) {
        if (!eventMap.has(event)) eventMap.set(event, { emitters: new Set(), listeners: new Set() });
        eventMap.get(event)!.listeners.add(service.name);
      }
    }

    const events = Array.from(eventMap.entries()).map(([event, { emitters, listeners }]) => ({
      event,
      emitters: Array.from(emitters),
      listeners: Array.from(listeners),
    }));

    return { events };
  }

  /**
   * Start periodic cleanup of expired services.
   */
  startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.registry.cleanup(this.options.heartbeatTtlMs).catch(err => {
        console.error('[ServiceDiscovery] Cleanup error:', err);
      });
    }, this.options.cleanupIntervalMs);
  }

  /**
   * Stop periodic cleanup.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get the underlying registry (for testing).
   */
  getRegistry(): IServiceRegistry {
    return this.registry;
  }
}
