/**
 * Substrate service — the compiled-path backing for agent substrate
 * operators (session/*, workspace/*, behavior/*, compose/*,
 * validate/validate, integration/*).
 *
 * The interface is owned here (same pattern as DataService). The host
 * application provides a concrete implementation via
 * `setSubstrateService()` at startup — typically wired from
 * `@almadar-io/rabit` runtime services or a custom adapter.
 *
 * The generated server code calls `getSubstrateService()` at runtime;
 * without a registered implementation, it throws on first access.
 */

import type {
    Orbital,
    OrbitalSchema,
    AgentMemoryRecord,
    SessionHistoryEntry,
    ServiceCallResult,
    BuilderResult,
    ValidateResult,
    ComposeAllResult,
    ComposeChildrenResult,
    LoloEmitResult,
    AnalysisResult,
    PlanSnapshot,
    ComposeOptions,
    GitHubRepo,
    GitHubIssue,
    TraitConfig,
    JsonValue,
} from '@almadar/core';

export interface SubstrateService {
    session: {
        readSpec(): Promise<Orbital>;
        writeSpec(name: string): Promise<void>;
        readHistory(): Promise<SessionHistoryEntry[]>;
        readMemory(): Promise<AgentMemoryRecord[]>;
        writeMemory(memory: AgentMemoryRecord[]): Promise<void>;
        readErrors(): Promise<string[]>;
        writeErrors(errors: string[]): Promise<void>;
        readAnalysis(): Promise<AnalysisResult>;
    };
    workspace: {
        readOrbital(name: string): Promise<Orbital>;
        writeOrbital(name: string, spec: Orbital): Promise<void>;
        readFile(path: string): Promise<string>;
        writeFile(path: string, content: string): Promise<void>;
        exists(path: string): Promise<boolean>;
        listOrbitals(): Promise<string[]>;
        readSchema(name: string): Promise<OrbitalSchema>;
        writeSchema(name: string, schema: OrbitalSchema): Promise<void>;
        readPlan(): Promise<PlanSnapshot>;
        writePlan(plan: PlanSnapshot): Promise<void>;
        archiveOrbital(name: string): Promise<void>;
    };
    behavior: {
        instantiate(behavior: string, config?: TraitConfig): Promise<BuilderResult>;
        call(ref: string, method: string, args?: TraitConfig): Promise<ServiceCallResult>;
        emitBody(orbitalName: string): Promise<LoloEmitResult>;
    };
    compose: {
        composeAll(options: ComposeOptions): Promise<ComposeAllResult>;
        composeChildren(options: ComposeOptions): Promise<ComposeChildrenResult>;
    };
    validate: {
        validate(name: string): Promise<ValidateResult>;
    };
    integration: {
        http(url: string, opts?: { method?: string; body?: JsonValue; headers?: Record<string, string> }): Promise<JsonValue>;
        githubGetRepo(owner: string, repo: string): Promise<GitHubRepo>;
        githubCreateIssue(owner: string, repo: string, title: string, body?: string): Promise<GitHubIssue>;
    };
    invoke(operator: string, args: JsonValue[]): Promise<ServiceCallResult>;
}

let _substrate: SubstrateService | null = null;

export function getSubstrateService(): SubstrateService {
    if (!_substrate) {
        throw new Error(
            'SubstrateService not configured. Call setSubstrateService() at server startup.',
        );
    }
    return _substrate;
}

export function setSubstrateService(service: SubstrateService): void {
    _substrate = service;
}

export function resetSubstrateService(): void {
    _substrate = null;
}
