declare module '@almadar-io/agent' {
  export class MemoryManager {
    constructor(config: Record<string, unknown>);
    updateUserPreferences(userId: string, prefs: Record<string, unknown>): Promise<void>;
    getUserPreferences(userId: string): Promise<Record<string, unknown> | null>;
    recordGeneration(data: Record<string, unknown>): Promise<void>;
    updateProjectContext(projectId: string, context: Record<string, unknown>): Promise<void>;
    recordFeedback(userId: string, feedback: Record<string, unknown>): Promise<void>;
  }
  export class SessionManager {
    constructor(config: Record<string, unknown>);
  }
  export interface FirestoreDb {
    collection(name: string): unknown;
  }
  export interface StateChangeEvent {
    threadId: string;
    [key: string]: unknown;
  }
  export function createSkillAgent(options: Record<string, unknown>): Promise<Record<string, unknown>>;
  export function getObservabilityCollector(): {
    getPerformanceSnapshot(): Record<string, unknown>;
    healthCheck(): Promise<Array<{ status: string }>>;
    getSessionTelemetry(threadId: string): Record<string, unknown> | null;
    getActiveSessions(): unknown[];
    startSession(threadId: string, userId: string): void;
    recordEvent(event: Record<string, unknown>): void;
    recordError(threadId: string, error: Error): void;
  };
  export function getMultiUserManager(): {
    assignSessionOwnership(threadId: string, userId: string): void;
    canAccessSession(threadId: string, user: { userId: string; roles: string[] }): { allowed: boolean; reason?: string };
    isSessionOwner(threadId: string, userId: string): boolean;
  };
  export function getStateSyncManager(): {
    updateConfig(config: Record<string, unknown>): void;
    receiveRemoteChange(event: StateChangeEvent): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
  };
  export function createUserContext(userId: string, opts: Record<string, unknown>): Record<string, unknown>;
  export function createWorkflowToolWrapper(config: Record<string, unknown>): { wrap: (fn: unknown) => unknown };
  export type SkillAgentOptions = Record<string, unknown>;
  export type SkillAgentResult = Record<string, unknown>;
}
