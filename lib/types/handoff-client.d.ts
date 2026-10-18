import type { Context } from '@deepseek-ai/cordis';
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ChatTranscript, ExportTranscriptRequest, ExportTranscriptResult, HandoffTarget, SummaryModel, SummarySource, SummarizeTranscriptRequest, WebsiteHandoffPort } from './handoff-types.js';
export interface HandoffChoice {
    readonly id: string;
    readonly label: string;
    readonly directory: string;
}
export interface HandoffTargets {
    readonly workspaces: readonly HandoffChoice[];
    readonly sessions: readonly HandoffChoice[];
}
export interface HandoffOptions extends HandoffTargets {
    readonly models: readonly SummaryModel[];
}
export interface PendingHandoffInsertion {
    readonly sessionId: string;
    readonly text: string;
    readonly exported: ExportTranscriptResult;
    readonly brief: string;
}
export interface HandoffViewState extends HandoffOptions {
    readonly available: boolean;
    readonly availabilityMessage: string;
    readonly open: boolean;
    readonly phase: 'idle' | 'options' | 'capture' | 'summary' | 'transfer' | 'ready' | 'done';
    readonly transcript: ChatTranscript | null;
    /** Turn keys the user unchecked; empty means every captured turn is included. */
    readonly deselectedTurnKeys: readonly string[];
    readonly allowPartial: boolean;
    readonly source: SummarySource;
    readonly modelIndex: number;
    readonly modelsLoading: boolean;
    readonly modelsError: string | null;
    readonly brief: string;
    readonly referenceOnly: boolean;
    readonly summaryFailed: boolean;
    readonly target: HandoffTarget | null;
    readonly error: string | null;
    readonly pendingInsertion: PendingHandoffInsertion | null;
}
export interface HandoffWorkflowDependencies {
    readonly getWebsite: () => WebsiteHandoffPort | null;
    options(signal: AbortSignal): Promise<HandoffTargets>;
    models(signal: AbortSignal): Promise<readonly SummaryModel[]>;
    summarize(request: SummarizeTranscriptRequest, signal: AbortSignal): Promise<string>;
    exportTranscript(request: ExportTranscriptRequest, signal: AbortSignal): Promise<ExportTranscriptResult>;
    deliver(target: HandoffTarget, exported: ExportTranscriptResult, brief: string, signal: AbortSignal): Promise<{
        sessionId: string;
        protected: boolean;
    }>;
    readonly onHarness: () => void;
    pickDirectory?(): Promise<string | null>;
}
/** State machine is transport-independent so cancellation and draft safety are testable. */
export declare function createHandoffWorkflow(deps: HandoffWorkflowDependencies): {
    getSnapshot: () => HandoffViewState;
    subscribe(listener: () => void): () => void;
    sessionInputMounted(sessionId: string): () => void;
    awaitSessionInput(sessionId: string, signal: AbortSignal): Promise<void>;
    setAvailable(available: boolean, message?: string): void;
    open(): Promise<void>;
    close(): void;
    cancel(): void;
    setAllowPartial(allowPartial: boolean): void;
    setSource(source: SummarySource): void;
    refreshModels(): Promise<void>;
    setModel(modelIndex: number): void;
    setBrief(brief: string): void;
    toggleTurn(key: string): void;
    selectAllTurns(): void;
    clearTurns(): void;
    setTarget(target: HandoffTarget | null): void;
    pickDirectory(): Promise<void>;
    useOriginalReference(): void;
    capture(): Promise<void>;
    summarize(): Promise<void>;
    transfer(): Promise<void>;
    insertPending(sessionId: string, actions: Pick<InputActions, "captureInsertion" | "insertText">): boolean;
    createNewFromPending(): Promise<void>;
    dismissPending(): void;
    dispose(): void;
};
export type HandoffController = ReturnType<typeof createHandoffWorkflow>;
/** Optional injection keeps original CHAT/HARNESS modes independent of SDK capability. */
export declare function createHandoffController(ctx: Context, getWebsite: () => WebsiteHandoffPort | null, onHarness: () => void): HandoffController;
