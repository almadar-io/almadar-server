declare module '@almadar-io/agent' {
  /** Configuration for memory manager initialization. */
  interface MemoryManagerConfig {
    mode?: string;
    firestoreDb?: FirestoreDb;
    [key: string]: unknown;
  }

  /** User preference data. */
  interface UserPreferences {
    [key: string]: string | number | boolean | null;
  }

  /** Generation record data. */
  interface GenerationRecord {
    prompt?: string;
    result?: string;
    timestamp?: number;
    [key: string]: unknown;
  }

  /** Project context data. */
  interface ProjectContext {
    schemaPath?: string;
    description?: string;
    [key: string]: unknown;
  }

  /** User feedback data. */
  interface UserFeedback {
    rating?: number;
    comment?: string;
    [key: string]: unknown;
  }

  export class MemoryManager {
    constructor(config: MemoryManagerConfig);
    updateUserPreferences(userId: string, prefs: UserPreferences): Promise<void>;
    getUserPreferences(userId: string): Promise<UserPreferences | null>;
    recordGeneration(data: GenerationRecord): Promise<void>;
    updateProjectContext(projectId: string, context: ProjectContext): Promise<void>;
    recordFeedback(userId: string, feedback: UserFeedback): Promise<void>;
  }

  /** Configuration for session manager initialization. */
  interface SessionManagerConfig {
    mode?: string;
    firestoreDb?: FirestoreDb;
    memoryManager?: MemoryManager;
    compactionConfig?: { maxTokens: number; keepRecentMessages: number; strategy: string };
    [key: string]: unknown;
  }

  /** Persistence mode shipped by @almadar-io/agent's SessionManager. */
  export type PersistenceMode = 'memory' | 'firestore';

  /** Per-thread session metadata persisted by the SessionManager. */
  export interface SessionMetadata {
    skill: string;
    workDir: string;
    createdAt: number;
    lastActivityAt: number;
    approveAll?: boolean;
  }

  /** Session metadata + its thread ID, returned when listing. */
  export interface SessionRecord extends SessionMetadata {
    threadId: string;
  }

  /**
   * Public surface of @almadar-io/agent's SessionManager. Methods mirror
   * the real class exactly so consumers can call them without `as any`
   * or local shadow types.
   */
  export class SessionManager {
    constructor(config: SessionManagerConfig);
    getMode(): PersistenceMode;
    store(threadId: string, metadata: SessionMetadata): void;
    get(threadId: string): SessionMetadata | undefined;
    getAsync(threadId: string): Promise<SessionMetadata | undefined>;
    clear(threadId: string): boolean;
    list(): SessionRecord[];
    listAsync(): Promise<SessionRecord[]>;
  }
  export interface FirestoreDb {
    collection(name: string): unknown;
  }
  export interface StateChangeEvent {
    threadId: string;
    [key: string]: unknown;
  }

  /** Options for creating a skill agent. */
  interface SkillAgentOptions {
    provider?: string;
    model?: string;
    skills?: string[];
    [key: string]: unknown;
  }

  /** Configuration accepted by `SkillAgent.stream`. */
  export interface SkillAgentStreamConfig {
    configurable: { thread_id: string };
    /**
     * langgraph recursion-depth ceiling per run. Forwarded to the
     * underlying graph; defaults to 25 when omitted.
     */
    recursionLimit?: number;
  }

  /** Input message shape for `SkillAgent.stream`. */
  export interface SkillAgentStreamInput {
    messages: Array<{ role: string; content: string }>;
  }

  /** One emission from `SkillAgent.stream`'s async iterator. */
  export interface SkillAgentStreamChunk {
    events?: Array<{ type: string; [key: string]: unknown }>;
    model_request?: {
      messages?: Array<{ kwargs?: { content?: Array<{ type: string }> } }>;
    };
  }

  /** Runtime agent instance returned alongside SkillAgentResult.agent. */
  export interface SkillAgent {
    stream(
      input: SkillAgentStreamInput,
      config: SkillAgentStreamConfig,
    ): Promise<AsyncIterable<SkillAgentStreamChunk>>;
  }

  /** Result from a skill agent execution. */
  interface SkillAgentResult {
    agent: SkillAgent;
    threadId: string;
    skill?: unknown;
    workDir?: string;
    [key: string]: unknown;
  }

  /** Performance metrics snapshot. */
  interface PerformanceSnapshot {
    uptime?: number;
    requestCount?: number;
    [key: string]: unknown;
  }

  /** Telemetry data for a session. */
  interface SessionTelemetry {
    threadId?: string;
    messageCount?: number;
    [key: string]: unknown;
  }

  /** Observability event record. */
  interface ObservabilityEvent {
    type: string;
    timestamp?: number;
    [key: string]: unknown;
  }

  export function createSkillAgent(options: SkillAgentOptions): Promise<SkillAgentResult>;
  export function getObservabilityCollector(): {
    getPerformanceSnapshot(): PerformanceSnapshot;
    healthCheck(): Promise<Array<{ status: string }>>;
    getSessionTelemetry(threadId: string): SessionTelemetry | null;
    getActiveSessions(): unknown[];
    startSession(threadId: string, userId: string): void;
    recordEvent(event: ObservabilityEvent): void;
    recordError(threadId: string, error: Error): void;
  };
  export function getMultiUserManager(): {
    assignSessionOwnership(threadId: string, userId: string): void;
    canAccessSession(threadId: string, user: { userId: string; roles: string[] }): { allowed: boolean; reason?: string };
    isSessionOwner(threadId: string, userId: string): boolean;
  };

  /** State sync configuration. */
  interface StateSyncConfig {
    clientId?: string;
    [key: string]: unknown;
  }

  export function getStateSyncManager(): {
    updateConfig(config: StateSyncConfig): void;
    receiveRemoteChange(event: StateChangeEvent): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
  };

  /** User context options. */
  interface UserContextOpts {
    roles?: string[];
    [key: string]: unknown;
  }

  /** User context result. */
  interface UserContext {
    userId: string;
    [key: string]: unknown;
  }

  /** Workflow tool wrapper configuration. */
  interface WorkflowToolConfig {
    tools?: string[];
    [key: string]: unknown;
  }

  export function createUserContext(userId: string, opts: UserContextOpts): UserContext;
  export function createWorkflowToolWrapper(config: WorkflowToolConfig): { wrap: (fn: unknown) => unknown };
  export type { SkillAgentOptions, SkillAgentResult, SkillAgent, SkillAgentStreamConfig, SkillAgentStreamInput, SkillAgentStreamChunk };
}
