import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionInputResolver, InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client';
import type { ExportTranscriptResult, HandoffTarget } from './handoff-types.js';
export interface HandoffSessionServices {
    readonly sessions: Pick<ISessions, 'create' | 'retain'>;
    readonly input: SessionInputResolver;
    readonly uiWorkspace: Pick<UiWorkspace, 'openSession'>;
    /** rc.2 restores persisted text in the resident UI's effect, before this barrier. */
    awaitMountedInput(sessionId: string, signal: AbortSignal): Promise<void>;
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
    interface SessionReferenceSourceMap {
        dshChatHandoff: unknown;
    }
}
/** Preserve the Host's stable absolute address, using the public @file grammar when representable. */
export declare function handoffDraftText(brief: string, exported: ExportTranscriptResult): string;
/** Semantic spans count chips correctly; collapse after selected text so it survives. */
export declare function insertHandoffAtCursor(actions: Pick<InputActions, 'captureInsertion' | 'insertText'>, text: string): boolean;
export declare function deliverHandoffDraft(services: HandoffSessionServices, target: HandoffTarget, exported: ExportTranscriptResult, brief: string, signal: AbortSignal): Promise<{
    sessionId: string;
    protected: boolean;
}>;
