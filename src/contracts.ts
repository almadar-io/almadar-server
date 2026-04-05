/**
 * Server Service Contracts
 *
 * Type-safe contract definitions for the three main services
 * callable from .orb schemas via `["call-service", ...]`.
 *
 * Each contract maps action names to their params/result types,
 * and the corresponding `ServiceContract<Actions>` type ensures
 * the runtime `execute(action, params)` call is fully typed.
 *
 * @packageDocumentation
 */

import type { ServiceContract, ServiceEvents } from '@almadar/core';

/** Entity data record: field name to field value. */
export type EntityRecord = { [fieldName: string]: string | number | boolean | Date | null | string[] };

// ============================================================================
// Data Service
// ============================================================================

/** Actions available on the data service (CRUD over collections). */
export type DataServiceActions = {
  list: {
    params: { collection: string };
    result: { items: unknown[] };
  };
  getById: {
    params: { collection: string; id: string };
    result: { item: unknown | null };
  };
  create: {
    params: { collection: string; data: EntityRecord };
    result: { item: unknown };
  };
  update: {
    params: { collection: string; id: string; data: EntityRecord };
    result: { item: unknown | null };
  };
  delete: {
    params: { collection: string; id: string };
    result: { deleted: boolean };
  };
};

/** Typed contract for the data service. */
export type DataServiceContract = ServiceContract<DataServiceActions>;

// ============================================================================
// Event Bus Service
// ============================================================================

/** Actions available on the event bus service. */
export type EventBusActions = {
  emit: {
    params: { event: string; payload?: unknown };
    result: { delivered: number };
  };
  getListenerCounts: {
    params: Record<string, never>;
    result: { counts: Record<string, number> };
  };
};

/** Typed contract for the event bus service. */
export type EventBusServiceContract = ServiceContract<EventBusActions>;

// ============================================================================
// Service Discovery
// ============================================================================

/** Shape of a discovered service instance. */
interface DiscoveredService {
  name: string;
  instanceId: string;
  host: string;
  port: number;
}

/** Actions available on the service discovery service. */
export type ServiceDiscoveryActions = {
  register: {
    params: {
      name: string;
      instanceId: string;
      host: string;
      port: number;
      emits: string[];
      listens: string[];
    };
    result: { registered: boolean };
  };
  findListeners: {
    params: { event: string };
    result: { services: DiscoveredService[] };
  };
  findEmitters: {
    params: { event: string };
    result: { services: DiscoveredService[] };
  };
};

/** Typed contract for the service discovery service. */
export type ServiceDiscoveryContract = ServiceContract<ServiceDiscoveryActions>;

// ============================================================================
// Event Maps
// ============================================================================

/** Events emitted by entity CRUD operations. */
export type EntityCrudEventMap = {
  [K in `${string}_CREATED`]: EntityRecord;
} & {
  [K in `${string}_UPDATED`]: EntityRecord;
} & {
  [K in `${string}_DELETED`]: EntityRecord;
};

/** Events emitted/consumed by the server infrastructure. */
export type ServerEventMap = {
  /** Emitted when a service instance registers with ServiceDiscovery. */
  SERVICE_REGISTERED: { name: string; instanceId: string; host: string; port: number };
  /** Emitted when a service instance deregisters or expires. */
  SERVICE_DEREGISTERED: { name: string; instanceId: string; reason: 'explicit' | 'expired' };
  /** Emitted when a service health check fails. */
  SERVICE_HEALTH_FAILED: { name: string; instanceId: string; error: string };
  /** Emitted when the distributed event bus connects. */
  TRANSPORT_CONNECTED: { instanceId: string; transport: string };
  /** Emitted when the distributed event bus disconnects. */
  TRANSPORT_DISCONNECTED: { instanceId: string; reason: string };
};

/** Typed event emitter for server events. */
export type ServerServiceEvents = ServiceEvents<ServerEventMap>;

// ============================================================================
// Grouped Record
// ============================================================================

/** All server service contracts keyed by service name. */
export type ServerServiceContracts = {
  data: DataServiceContract;
  eventBus: EventBusServiceContract;
  serviceDiscovery: ServiceDiscoveryContract;
};
