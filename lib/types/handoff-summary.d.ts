import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { SummarizeTranscriptRequest, SummaryModel } from './handoff-types.js';
export interface HandoffLlm {
    listProviders(): LlmProviderInfo[];
    listModels(provider: string): Promise<LlmModelInfo[]>;
    /** Exact-route metadata used to pick the least reasoning effort for an auxiliary call. */
    resolveModelInfo?(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
interface SummaryLimits {
    maxRequestChars?: number;
    maxOutputChars?: number;
    deadlineMs?: number;
}
export declare class HandoffSummaryError extends Error {
}
/** Direct auxiliary LLM requests; no agent loop, durable session, or implicit model selection. */
export declare class HandoffSummarizer {
    private readonly llm;
    private readonly maxRequestChars;
    private readonly maxOutputChars;
    private readonly deadlineMs;
    constructor(llm: HandoffLlm | undefined, limits?: SummaryLimits);
    private requireLlm;
    private run;
    private available;
    models(signal: AbortSignal): Promise<SummaryModel[]>;
    summarize(value: SummarizeTranscriptRequest, signal: AbortSignal): Promise<string>;
    private call;
}
export {};
