import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type { ExportTranscriptRequest, ExportTranscriptResult, SummarizeTranscriptRequest, SummaryModel } from './handoff-types.js'
import { DSH_HANDOFF_HOST_CONTRIBUTION } from './handoff-protocol.js'
import { exportTranscript, HandoffExportError } from './handoff-export.js'
import { HandoffSummarizer, HandoffSummaryError } from './handoff-summary.js'

/** Independent handoff namespace; no credentials, agent loop or task submission. */
export class DshChatHandoffController extends TypertRemoteService {
  static inject = ['typert']
  private readonly lifetime = new AbortController()
  constructor(ctx: Context) {
    super(ctx, 'dshChatHandoff')
    ctx.typert.register(DSH_HANDOFF_HOST_CONTRIBUTION)
    ctx.effect(() => () => this.lifetime.abort(), 'DeepSeek CHAT handoff lifetime')
  }

  private active(signal: AbortSignal): AbortSignal { return AbortSignal.any([signal, this.lifetime.signal]) }
  private failure(error: unknown, signal: AbortSignal): never {
    if (signal.aborted) throw new RemoteError('gateway/cancelled', 'Handoff was cancelled. Reopen the handoff preview to retry.', {})
    if (error instanceof HandoffSummaryError || error instanceof HandoffExportError) throw new RemoteError('gateway/internal', error.message, {})
    throw new RemoteError('gateway/internal', 'Handoff could not complete. Check the selected local directory or Harness provider and retry.', {})
  }

  @Remote
  async models(signal: AbortSignal): Promise<SummaryModel[]> {
    const active = this.active(signal)
    try { return await new HandoffSummarizer(this.ctx.get('llm')).models(active) }
    catch (error) { return this.failure(error, active) }
  }

  @Remote
  async summarize(request: SummarizeTranscriptRequest, signal: AbortSignal): Promise<string> {
    const active = this.active(signal)
    try { return await new HandoffSummarizer(this.ctx.get('llm')).summarize(request, active) }
    catch (error) { return this.failure(error, active) }
  }

  @Remote
  async exportTranscript(request: ExportTranscriptRequest, signal: AbortSignal): Promise<ExportTranscriptResult> {
    const active = this.active(signal)
    try {
      const registry = this.ctx.get('workspaceRegistry')
      const persistence = this.ctx.get('sessionPersistence')
      return await exportTranscript(request, {
        workspaceRegistry: registry ? { get: id => registry.get(id as WorkspaceId) } : undefined,
        sessionPersistence: persistence ? { open: (id, access, options) => persistence.open(id as SessionId, access, options) } : undefined,
      }, active)
    } catch (error) { return this.failure(error, active) }
  }
}
declare module '@deepseek-ai/cordis' { interface Context { dshChatHandoff: DshChatHandoffController } }
