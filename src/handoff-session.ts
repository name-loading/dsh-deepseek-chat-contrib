import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionInputResolver, InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar'
import type { ExportTranscriptResult, HandoffTarget } from './handoff-types.js'

export interface HandoffSessionServices {
  readonly sessions: Pick<ISessions, 'create' | 'retain'>
  readonly input: SessionInputResolver
  readonly uiWorkspace: Pick<UiWorkspace, 'openSession'>
  /** rc.2 restores persisted text in the resident UI's effect, before this barrier. */
  awaitMountedInput(sessionId: string, signal: AbortSignal): Promise<void>
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { dshChatHandoff: unknown }
}

/** Preserve the Host's stable absolute address, using the public @file grammar when representable. */
export function handoffDraftText(brief: string, exported: ExportTranscriptResult): string {
  const directory = exported.directory.replaceAll('\\', '/').replace(/\/+$/, '')
  const file = exported.filePath.replaceAll('\\', '/')
  const windows = /^[a-z]:\//i.test(directory) || directory.startsWith('//')
  const compare = (value: string) => windows ? value.toLowerCase() : value
  if (!compare(file).startsWith(`${compare(directory)}/`)) throw new Error('原文文件必须位于目标工作目录内。')
  const relative = file.slice(directory.length + 1)
  if (!relative || relative.split('/').some(part => part === '..' || part === '.')) throw new Error('原文文件路径无效。')
  const reference = formatFileMention({ path: file, kind: 'file' }, false)
  return reference ? `${brief.trim()}\n\n原始对话：${reference}` : `${brief.trim()}\n\n原始对话文件（绝对路径）：${exported.filePath}`
}

/** Semantic spans count chips correctly; collapse after selected text so it survives. */
export function insertHandoffAtCursor(actions: Pick<InputActions, 'captureInsertion' | 'insertText'>, text: string): boolean {
  const span = actions.captureInsertion()
  return actions.insertText(`\n\n${text}\n\n`, { ...span, start: span.end })
}

export async function deliverHandoffDraft(services: HandoffSessionServices, target: HandoffTarget, exported: ExportTranscriptResult, brief: string, signal: AbortSignal): Promise<{sessionId: string; protected: boolean}> {
  signal.throwIfAborted()
  const text = handoffDraftText(brief, exported)
  const sessionId = target.kind === 'session' ? target.sessionId as Parameters<ISessions['retain']>[0]
    : await services.sessions.create({ cwd: exported.directory, ...(target.kind === 'workspace' ? { workspaceId: target.workspaceId as NonNullable<Parameters<ISessions['create']>[0]>['workspaceId'] } : {}) })
  signal.throwIfAborted()
  const reference = services.sessions.retain(sessionId, { source: 'dshChatHandoff', signal })
  try {
    const binding = await reference.ready
    signal.throwIfAborted()
    const initialize = services.input.requestDraftInitialization
    const modern = typeof initialize === 'function'
    // rc.2's shell starts empty until DefaultConversationViews restores its store.
    // Let the official UI finish that effect before inspecting or seeding the draft.
    if (!modern) {
      services.uiWorkspace.openSession(sessionId)
      await services.awaitMountedInput(String(sessionId), signal)
      signal.throwIfAborted()
    }
    const input = services.input.for(binding.ctx)
    const state = input.state.getSnapshot()
    let protectedDraft = state.draft.length > 0 || state.attachmentIds.length > 0 || state.occurrences.length > 0 || state.phase !== 'plain'
    // No await between inspection and write: concurrent user edits cannot be overwritten.
    if (!protectedDraft) {
      if (modern) protectedDraft = initialize.call(services.input, binding, { prompt: text, clearPreviousDraft: false }) !== 'applied'
      else input.setDraft(text)
    }
    signal.throwIfAborted()
    // Public openSession synchronously takes the UI's own reference before returning.
    if (modern) services.uiWorkspace.openSession(sessionId)
    return { sessionId: String(sessionId), protected: protectedDraft }
  } finally { reference.release() }
}
