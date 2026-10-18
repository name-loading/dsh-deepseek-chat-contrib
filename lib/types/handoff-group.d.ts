import type { ChatMessage, ChatTranscript } from './handoff-types.js';
export interface TranscriptTurn {
    /** Stable key for selection: the id of this turn's first message. */
    readonly key: string;
    readonly title: string;
    readonly messages: readonly ChatMessage[];
}
/**
 * Build one collapsible group per user message so a long captured transcript can
 * be reviewed by opening only the turns that matter.
 */
export declare function groupTranscriptTurns(messages: readonly ChatMessage[]): TranscriptTurn[];
/**
 * Keep only the turns the user left selected. Unselected turns are removed from
 * both the API summary request and the exported transcript file.
 */
export declare function filterTranscript(transcript: ChatTranscript, deselectedTurnKeys: readonly string[]): {
    readonly transcript: ChatTranscript;
    readonly selected: number;
    readonly total: number;
};
