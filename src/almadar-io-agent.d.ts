declare module '@almadar-io/rabit' {
  // Re-export the canonical SSE event vocabulary so consumers of
  // @almadar/server can import SSEEvent without adding a direct
  // dependency on @almadar-io/rabit.
  export type {
    SSEEvent,
    SSEEventType,
    SSEEventBase,
    StartEvent,
    MessageEvent,
    ToolCallEvent,
    ToolResultEvent,
    TodoUpdateEvent,
    TodoDetailEvent,
    TodoActivityType,
    FileOperationEvent,
    FileWrittenEvent,
    SchemaUpdateEvent,
    GenerationLogEvent,
    SubagentEvent,
    SubagentStartEvent,
    SubagentProgressEvent,
    SubagentCompleteEvent,
    InterruptEvent,
    ErrorEvent,
    CancelledEvent,
    CompleteEvent,
    AppCreatedEvent,
    SchemaPhaseValidatedEvent,
    SchemaPhaseUpdateEvent,
    OrbitalAddedEvent,
    OrbitalSchemaCompleteEvent,
    ProcessStartEvent,
    ProcessCompleteEvent,
    ProcessErrorEvent,
    ProcessRepairEvent,
    ProcessRepairCompleteEvent,
    ParamsRepairEmittedEvent,
    ChangesetRecordedEvent,
    SnapshotCreatedEvent,
    GateStartEvent,
    GateCompleteEvent,
    JepaValidityEvent,
    JepaErrorsEvent,
    JepaGapEvent,
    JepaRepairEvent,
    ViewChangeEvent,
    EditModeEnterEvent,
    EditModeExitEvent,
    EditSelectEvent,
    CoordinatorDecisionEvent,
    PlanCommittedEvent,
    PendingQuestionEvent,
    ClarificationQuestionEvent,
    CoordinatorThinkingEvent,
    ChatMessageAppendedEvent,
    AnalysisCompleteEvent,
  } from '@almadar-io/rabit';

  // Core rabit entry point
  export function runRabit(options: RabitOptions): Promise<RabitResult>;
  export interface RabitOptions {
    prompt: string;
    workDir: string;
    userId?: string;
    workspace?: unknown;
    provider: string;
    model: string;
    loloMode?: boolean;
    dryRun?: boolean;
    preAnalysis?: unknown;
    signal?: AbortSignal;
    pauseController?: unknown;
    callbacks?: unknown;
    extraBehaviors?: unknown;
  }
  export interface RabitResult {
    schema: unknown;
    orbitals: unknown[];
    durationMs: number;
    tracePath: string;
  }

  // Session store
  export class SessionStore {
    constructor(workDir: string, workspace: unknown);
  }

  // Trace
  export interface TraceEvent {
    type: string;
    timestamp: number;
    [key: string]: unknown;
  }
  export function emitTraceEvent(workspace: unknown, event: TraceEvent): Promise<void>;
  export function readTrace(workspace: unknown): TraceEvent[];

  // Session + memory types
  export interface HistoryEntry {
    role: string;
    content: string;
    timestamp: number;
    metadata?: unknown;
  }
  export interface OrbitalMemory {
    [key: string]: unknown;
  }
  export interface ChatMessage {
    role: string;
    content: string;
    toolCalls?: unknown[];
    toolCallId?: string;
    toolName?: string;
    reasoningContent?: string;
  }
}
