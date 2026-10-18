import { z } from 'zod';
import type { InvocationDescriptor, RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import type { ExportTranscriptRequest, ExportTranscriptResult, SummarizeTranscriptRequest, SummaryModel } from './handoff-types.js';
export declare const chatTranscriptSchema: z.ZodObject<{
    id: z.ZodString;
    sourceUrl: z.ZodString;
    title: z.ZodString;
    capturedAt: z.ZodNumber;
    branchSignature: z.ZodString;
    scope: z.ZodEnum<{
        complete: "complete";
        loaded: "loaded";
    }>;
    scopeNote: z.ZodString;
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        role: z.ZodEnum<{
            user: "user";
            assistant: "assistant";
        }>;
        markdown: z.ZodString;
        attachments: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const summarizeTranscriptRequestSchema: z.ZodObject<{
    transcript: z.ZodObject<{
        id: z.ZodString;
        sourceUrl: z.ZodString;
        title: z.ZodString;
        capturedAt: z.ZodNumber;
        branchSignature: z.ZodString;
        scope: z.ZodEnum<{
            complete: "complete";
            loaded: "loaded";
        }>;
        scopeNote: z.ZodString;
        messages: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            role: z.ZodEnum<{
                user: "user";
                assistant: "assistant";
            }>;
            markdown: z.ZodString;
            attachments: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    provider: z.ZodString;
    model: z.ZodString;
}, z.core.$strict>;
export declare const exportTranscriptRequestSchema: z.ZodObject<{
    transcript: z.ZodObject<{
        id: z.ZodString;
        sourceUrl: z.ZodString;
        title: z.ZodString;
        capturedAt: z.ZodNumber;
        branchSignature: z.ZodString;
        scope: z.ZodEnum<{
            complete: "complete";
            loaded: "loaded";
        }>;
        scopeNote: z.ZodString;
        messages: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            role: z.ZodEnum<{
                user: "user";
                assistant: "assistant";
            }>;
            markdown: z.ZodString;
            attachments: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    allowPartial: z.ZodBoolean;
    target: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"workspace">;
        workspaceId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"session">;
        sessionId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"directory">;
        directory: z.ZodString;
    }, z.core.$strict>], "kind">;
}, z.core.$strict>;
export declare const DSH_HANDOFF_DESCRIPTORS: readonly InvocationDescriptor[];
export declare const DSH_HANDOFF_REMOTE_CONTRIBUTION: TypertRemoteContribution;
export declare const DSH_HANDOFF_HOST_CONTRIBUTION: TypertContribution;
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteMap {
        'dshChatHandoff/models': (signal?: AbortSignal) => Promise<RemoteResult<SummaryModel[]>>;
        'dshChatHandoff/summarize': (request: SummarizeTranscriptRequest, signal?: AbortSignal) => Promise<RemoteResult<string>>;
        'dshChatHandoff/exportTranscript': (request: ExportTranscriptRequest, signal?: AbortSignal) => Promise<RemoteResult<ExportTranscriptResult>>;
    }
    interface TypertRemoteNamespaceMap {
        dshChatHandoff: import('@deepseek-ai/dsh-typert-protocol').TypertRemoteNamespace<'dshChatHandoff'>;
    }
}
