import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { ExportTranscriptRequest, ExportTranscriptResult, SummarizeTranscriptRequest, SummaryModel } from './handoff-types.js';
/** Independent handoff namespace; no credentials, agent loop or task submission. */
export declare class DshChatHandoffController extends TypertRemoteService {
    static inject: string[];
    private readonly lifetime;
    constructor(ctx: Context);
    private active;
    private failure;
    models(signal: AbortSignal): Promise<SummaryModel[]>;
    summarize(request: SummarizeTranscriptRequest, signal: AbortSignal): Promise<string>;
    exportTranscript(request: ExportTranscriptRequest, signal: AbortSignal): Promise<ExportTranscriptResult>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        dshChatHandoff: DshChatHandoffController;
    }
}
