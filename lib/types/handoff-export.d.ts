import type { ChatTranscript, ExportTranscriptRequest, ExportTranscriptResult } from './handoff-types.js';
/** Only the public read-only target methods needed by handoff. No session log reads. */
export interface HandoffTargetServices {
    workspaceRegistry?: {
        get(id: string): {
            readonly path: string;
        } | undefined | Promise<{
            readonly path: string;
        } | undefined>;
    };
    sessionPersistence?: {
        open(id: string, access: 'read', options?: {
            signal?: AbortSignal;
        }): Promise<{
            readonly header: {
                readonly cwd?: string;
            };
            close(): Promise<void>;
        }>;
    };
}
export declare class HandoffExportError extends Error {
}
export declare function renderTranscriptMarkdown(value: ChatTranscript): string;
/** Exclusive atomic publication: a retry may reuse identical bytes, never replace a transcript. */
export declare function exportTranscript(value: ExportTranscriptRequest, services: HandoffTargetServices, parent: AbortSignal): Promise<ExportTranscriptResult>;
