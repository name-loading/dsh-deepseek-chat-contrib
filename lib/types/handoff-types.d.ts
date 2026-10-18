/** Content is captured only for an explicit handoff; never part of navigation or credentials. */
export interface ChatMessage {
    readonly id: string;
    readonly role: 'user' | 'assistant';
    readonly markdown: string;
    readonly attachments?: readonly string[];
}
export interface ChatTranscript {
    readonly id: string;
    readonly sourceUrl: string;
    readonly title: string;
    readonly capturedAt: number;
    readonly branchSignature: string;
    readonly scope: 'complete' | 'loaded';
    readonly scopeNote: string;
    readonly messages: readonly ChatMessage[];
}
export type SummarySource = 'web' | 'harness';
export interface SummaryModel {
    readonly provider: string;
    readonly model: string;
    readonly label: string;
}
export type HandoffTarget = {
    readonly kind: 'workspace';
    readonly workspaceId: string;
} | {
    readonly kind: 'session';
    readonly sessionId: string;
} | {
    readonly kind: 'directory';
    readonly directory: string;
};
export interface ExportTranscriptRequest {
    readonly transcript: ChatTranscript;
    readonly target: HandoffTarget;
    readonly allowPartial: boolean;
}
export interface ExportTranscriptResult {
    readonly filePath: string;
    readonly directory: string;
}
export interface SummarizeTranscriptRequest {
    readonly transcript: ChatTranscript;
    readonly provider: string;
    readonly model: string;
}
export interface WebsiteHandoffPort {
    capture(signal: AbortSignal): Promise<ChatTranscript>;
    /** Observe captured source identity changes without polling conversation bodies. */
    watchSource(transcript: ChatTranscript, onInvalid: (reason: Error) => void, options?: {
        readonly allowModeChange?: boolean;
    }): () => void;
    validate(transcript: ChatTranscript, signal: AbortSignal): Promise<void>;
    summarize(transcript: ChatTranscript, signal: AbortSignal): Promise<string>;
}
