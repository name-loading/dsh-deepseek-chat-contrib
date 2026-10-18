import { z } from 'zod'
import type { InvocationDescriptor, RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import type { ChatTranscript, ExportTranscriptRequest, ExportTranscriptResult, SummarizeTranscriptRequest, SummaryModel } from './handoff-types.js'

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const routeId = z.string().min(1).max(512)
const sourceUrl = z.string().max(8192).refine(value => {
  try { const url = new URL(value); return url.origin === 'https://chat.deepseek.com' && !url.username && !url.password }
  catch { return false }
}, 'Expected a DeepSeek CHAT source URL')
export const chatTranscriptSchema = z.strictObject({
  id: identifier, sourceUrl, title: z.string().max(4096), capturedAt: z.number().int().min(0).max(8_640_000_000_000_000),
  branchSignature: z.string().min(1).max(4096), scope: z.enum(['complete', 'loaded']), scopeNote: z.string().max(4096),
  messages: z.array(z.strictObject({
    id: z.string().min(1).max(512), role: z.enum(['user', 'assistant']), markdown: z.string().max(4_000_000),
    attachments: z.array(z.string().max(8192)).max(128).optional(),
  })).min(1).max(20_000),
}).refine(value => JSON.stringify(value).length <= 4_000_000, 'Transcript exceeds the handoff payload limit') satisfies z.ZodType<ChatTranscript>
export const summarizeTranscriptRequestSchema = z.strictObject({
  transcript: chatTranscriptSchema, provider: routeId, model: routeId,
}) satisfies z.ZodType<SummarizeTranscriptRequest>
export const exportTranscriptRequestSchema = z.strictObject({
  transcript: chatTranscriptSchema, allowPartial: z.boolean(),
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('workspace'), workspaceId: identifier }),
    z.strictObject({ kind: z.literal('session'), sessionId: identifier }),
    z.strictObject({ kind: z.literal('directory'), directory: z.string().min(1).max(16_384).refine(value => !value.includes('\0')) }),
  ]),
}) satisfies z.ZodType<ExportTranscriptRequest>
const summaryModelSchema = z.strictObject({ provider: routeId, model: routeId, label: z.string().min(1).max(2048) })
const exportResultSchema = z.strictObject({ filePath: z.string().max(32_768), directory: z.string().max(16_384) })
const strict = (name: string, schema: z.ZodType) => ({
  mode: 'strict' as const, typeSymbol: `dsh-deepseek-chat#handoff/${name}`, create: () => schema,
})
const descriptor = (method: string, request: z.ZodType | undefined, result: z.ZodType): InvocationDescriptor => ({
  id: `dsh-deepseek-chat#dshChatHandoff/${method}`, service: 'dshChatHandoff', namespace: 'dshChatHandoff', method,
  invocation: { kind: 'direct' }, parameters: request ? [{ name: 'request', wire: 'request', source: 'json', codec: strict(`${method}Request`, request) }] : [],
  cancellation: { parameter: 'signal' }, result: strict(`${method}Result`, result),
})
export const DSH_HANDOFF_DESCRIPTORS: readonly InvocationDescriptor[] = [
  descriptor('models', undefined, z.array(summaryModelSchema).max(20_000)),
  descriptor('summarize', summarizeTranscriptRequestSchema, z.string().min(1).max(100_000)),
  descriptor('exportTranscript', exportTranscriptRequestSchema, exportResultSchema),
]
export const DSH_HANDOFF_REMOTE_CONTRIBUTION: TypertRemoteContribution = {
  package: 'dsh-deepseek-chat/handoff', descriptors: DSH_HANDOFF_DESCRIPTORS,
}
export const DSH_HANDOFF_HOST_CONTRIBUTION: TypertContribution = {
  package: 'dsh-deepseek-chat/handoff', face: 'host', schemas: [],
  model: { services: [], events: [], objects: [] }, invocations: DSH_HANDOFF_DESCRIPTORS,
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'dshChatHandoff/models': (signal?: AbortSignal) => Promise<RemoteResult<SummaryModel[]>>
    'dshChatHandoff/summarize': (request: SummarizeTranscriptRequest, signal?: AbortSignal) => Promise<RemoteResult<string>>
    'dshChatHandoff/exportTranscript': (request: ExportTranscriptRequest, signal?: AbortSignal) => Promise<RemoteResult<ExportTranscriptResult>>
  }
  interface TypertRemoteNamespaceMap {
    dshChatHandoff: import('@deepseek-ai/dsh-typert-protocol').TypertRemoteNamespace<'dshChatHandoff'>
  }
}
