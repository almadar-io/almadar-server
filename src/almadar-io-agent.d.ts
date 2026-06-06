declare module '@almadar-io/rabit' {
  import type { JsonObject, JsonValue } from '@almadar/core';

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
    workspace?: import('@almadar/workspace').WorkspaceService;
    provider: string;
    model: string;
    loloMode?: boolean;
    dryRun?: boolean;
    preAnalysis?: JsonValue;
    signal?: AbortSignal;
    pauseController?: import('./runtime/pause-controller.js').PauseController;
    callbacks?: import('./llm/turn.js').AgentTurnCallbacks;
    extraBehaviors?: import('./schema/behaviors/extras.js').ExtraBehaviorDispatch;
  }
  export interface RabitResult {
    schema: JsonObject;
    orbitals: JsonObject[];
    durationMs: number;
    tracePath: string;
  }

  // Session store
  export class SessionStore {
    constructor(workDir: string, workspace: import('@almadar/workspace').WorkspaceService);
  }

  // Trace
  export interface TraceEvent {
    type: string;
    timestamp: number;
    [key: string]: JsonValue;
  }
  export function emitTraceEvent(
    workspace: import('@almadar/workspace').WorkspaceService,
    event: TraceEvent,
  ): Promise<void>;
  export function readTrace(workspace: import('@almadar/workspace').WorkspaceService): TraceEvent[];

  // Session + memory types
  export interface HistoryEntry {
    role: string;
    content: string;
    timestamp: number;
    metadata?: JsonObject;
  }
  export interface OrbitalMemory {
    entityName?: string;
    fields?: string[];
    emits?: string[];
    listens?: string[];
    notes?: string[];
    [key: string]: JsonValue | undefined;
  }
  export interface ChatMessage {
    role: string;
    content: string;
    toolCalls?: JsonObject[];
    toolCallId?: string;
    toolName?: string;
    reasoningContent?: string;
  }
}
