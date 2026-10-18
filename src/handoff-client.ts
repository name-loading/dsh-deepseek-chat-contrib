import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { DSH_HANDOFF_REMOTE_CONTRIBUTION } from './handoff-protocol.js'
import { deliverHandoffDraft, handoffDraftText, insertHandoffAtCursor } from './handoff-session.js'
import { filterTranscript, groupTranscriptTurns } from './handoff-group.js'
import type { ChatTranscript, ExportTranscriptRequest, ExportTranscriptResult, HandoffTarget, SummaryModel, SummarySource, SummarizeTranscriptRequest, WebsiteHandoffPort } from './handoff-types.js'

export interface HandoffChoice { readonly id: string; readonly label: string; readonly directory: string }
export interface HandoffTargets { readonly workspaces: readonly HandoffChoice[]; readonly sessions: readonly HandoffChoice[] }
export interface HandoffOptions extends HandoffTargets { readonly models: readonly SummaryModel[] }
export interface PendingHandoffInsertion { readonly sessionId: string; readonly text: string; readonly exported: ExportTranscriptResult; readonly brief: string }
export interface HandoffViewState extends HandoffOptions {
  readonly available: boolean
  readonly availabilityMessage: string
  readonly open: boolean
  readonly phase: 'idle' | 'options' | 'capture' | 'summary' | 'transfer' | 'ready' | 'done'
  readonly transcript: ChatTranscript | null
  /** Turn keys the user unchecked; empty means every captured turn is included. */
  readonly deselectedTurnKeys: readonly string[]
  readonly allowPartial: boolean
  readonly source: SummarySource
  readonly modelIndex: number
  readonly modelsLoading: boolean
  readonly modelsError: string | null
  readonly brief: string
  readonly referenceOnly: boolean
  readonly summaryFailed: boolean
  readonly target: HandoffTarget | null
  readonly error: string | null
  readonly pendingInsertion: PendingHandoffInsertion | null
}
export interface HandoffWorkflowDependencies {
  readonly getWebsite: () => WebsiteHandoffPort | null
  options(signal: AbortSignal): Promise<HandoffTargets>
  models(signal: AbortSignal): Promise<readonly SummaryModel[]>
  summarize(request: SummarizeTranscriptRequest, signal: AbortSignal): Promise<string>
  exportTranscript(request: ExportTranscriptRequest, signal: AbortSignal): Promise<ExportTranscriptResult>
  deliver(target: HandoffTarget, exported: ExportTranscriptResult, brief: string, signal: AbortSignal): Promise<{sessionId: string; protected: boolean}>
  readonly onHarness: () => void
  pickDirectory?(): Promise<string | null>
}

function awaitWithCancellation<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** State machine is transport-independent so cancellation and draft safety are testable. */
export function createHandoffWorkflow(deps: HandoffWorkflowDependencies) {
  let state: HandoffViewState = {
    available: false, availabilityMessage: '当前桌面版本未提供交接所需的本机会话、工作区或导出服务。',
    open: false, phase: 'idle', transcript: null, deselectedTurnKeys: [], allowPartial: false, source: 'harness', modelIndex: 0, modelsLoading: false, modelsError: null,
    models: [], workspaces: [], sessions: [], brief: '', referenceOnly: false, summaryFailed: false,
    target: null, error: null, pendingInsertion: null,
  }
  const listeners = new Set<() => void>()
  let request: AbortController | null = null
  let modelRequest: AbortController | null = null
  let disposed = false
  const mountedInputs = new Map<string, Set<symbol>>()
  const inputWaiters = new Map<string, Set<() => void>>()
  const publish = (patch: Partial<HandoffViewState>) => {
    if (disposed) return
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }
  const cancel = () => { request?.abort(); request = null }
  const cancelModels = () => { modelRequest?.abort(); modelRequest = null }
  const begin = (phase: HandoffViewState['phase']) => {
    cancel()
    const operation = new AbortController()
    request = operation
    publish({ phase, error: null })
    return operation
  }
  const current = (operation: AbortController) => !disposed && request === operation && !operation.signal.aborted
  const fail = (operation: AbortController, error: unknown, summary = false) => {
    if (!current(operation)) return
    publish({ phase: state.transcript ? 'ready' : 'idle', error: error instanceof Error ? error.message : '交接失败，请重试。', ...(summary ? { summaryFailed: true } : {}) })
  }
  const scopeAccepted = () => state.transcript && (state.transcript.scope === 'complete' || state.allowPartial)
  const source = () => {
    const website = deps.getWebsite()
    if (!website) throw new Error('当前 CHAT 网页尚未就绪，请返回网页后重试。')
    return website
  }
  async function validate(website: WebsiteHandoffPort, transcript: ChatTranscript, operation: AbortController) {
    operation.signal.throwIfAborted()
    if (deps.getWebsite() !== website) throw new Error('来源网页已经变化，请重新采集。')
    await website.validate(transcript, operation.signal)
    operation.signal.throwIfAborted()
    if (deps.getWebsite() !== website) throw new Error('来源网页已经变化，请重新采集。')
  }
  const controller = {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    sessionInputMounted(sessionId: string) {
      const token = Symbol('official session input mounted')
      const owners = mountedInputs.get(sessionId) ?? new Set<symbol>()
      owners.add(token); mountedInputs.set(sessionId, owners)
      for (const ready of inputWaiters.get(sessionId) ?? []) ready()
      return () => { owners.delete(token); if (!owners.size) mountedInputs.delete(sessionId) }
    },
    awaitSessionInput(sessionId: string, signal: AbortSignal): Promise<void> {
      signal.throwIfAborted()
      if (mountedInputs.get(sessionId)?.size) return Promise.resolve()
      return new Promise((resolve, reject) => {
        const waiters = inputWaiters.get(sessionId) ?? new Set<() => void>()
        let timer: ReturnType<typeof setTimeout>
        const clean = () => { clearTimeout(timer); signal.removeEventListener('abort', aborted); waiters.delete(ready); if (!waiters.size) inputWaiters.delete(sessionId) }
        const ready = () => { clean(); resolve() }
        const aborted = () => { clean(); reject(signal.reason) }
        waiters.add(ready); inputWaiters.set(sessionId, waiters)
        signal.addEventListener('abort', aborted, { once: true })
        timer = setTimeout(() => { clean(); reject(new Error('HARNESS 输入框尚未就绪；原文文件已保存，请重试。')) }, 20_000)
      })
    },
    setAvailable(available: boolean, message?: string) {
      if (!available) { cancel(); cancelModels() }
      publish({ available, availabilityMessage: message ?? (available ? '' : '当前桌面版本未提供交接所需的本机会话、工作区或导出服务。'), ...(!available ? { phase: state.transcript ? 'ready' as const : 'idle' as const, modelsLoading: false } : {}) })
    },
    async open() {
      if (!state.available) { publish({ open: true }); return }
      cancelModels()
      const operation = begin('options')
      publish({ open: true, transcript: null, deselectedTurnKeys: [], brief: '', allowPartial: false, summaryFailed: false, referenceOnly: false, models: [], modelsLoading: false, modelsError: null, source: 'harness' })
      try {
        const options = await deps.options(operation.signal)
        if (!current(operation)) return
        publish({ ...options, modelIndex: 0, source: 'harness', target: options.workspaces[0] ? { kind: 'workspace', workspaceId: options.workspaces[0].id } : null, phase: 'idle' })
        // The dialog summarizes through a configured HARNESS model, so load the
        // model list in the background; local targets never wait for discovery.
        void controller.refreshModels()
      } catch (error) { fail(operation, error) }
    },
    close() { cancel(); cancelModels(); publish({ open: false, transcript: null, deselectedTurnKeys: [], brief: '', phase: 'idle', error: null, modelsLoading: false }) },
    cancel() { cancel(); cancelModels(); publish({ phase: state.transcript ? 'ready' : 'idle', error: '已取消；尚未交给 HARNESS。', modelsLoading: false }) },
    setAllowPartial(allowPartial: boolean) { cancel(); publish({ allowPartial, phase: state.transcript ? 'ready' : 'idle' }) },
    setSource(source: SummarySource) {
      cancel()
      if (source === 'web') cancelModels()
      publish({ source, brief: '', referenceOnly: false, summaryFailed: false, error: null, ...(source === 'web' ? { modelsLoading: false } : {}), phase: state.transcript ? 'ready' : 'idle' })
      if (source === 'harness' && !state.models.length && !modelRequest) void controller.refreshModels()
    },
    async refreshModels() {
      if (!state.available || !state.open || state.source !== 'harness') return
      cancelModels()
      const operation = new AbortController()
      modelRequest = operation
      publish({ modelsLoading: true, modelsError: null })
      try {
        const models = await deps.models(operation.signal)
        if (disposed || modelRequest !== operation || operation.signal.aborted) return
        publish({ models, modelIndex: 0, modelsLoading: false, modelsError: models.length ? null : '未找到可用的 HARNESS 模型；请检查配置或使用官网总结。' })
      } catch {
        if (!disposed && modelRequest === operation && !operation.signal.aborted) publish({ modelsLoading: false, modelsError: 'HARNESS 模型列表暂不可用；可重试或使用官网总结。' })
      } finally { if (modelRequest === operation) modelRequest = null }
    },
    setModel(modelIndex: number) { cancel(); publish({ modelIndex, brief: '', referenceOnly: false, summaryFailed: false, phase: state.transcript ? 'ready' : 'idle' }) },
    setBrief(brief: string) { publish({ brief }) },
    toggleTurn(key: string) {
      if (!state.transcript) return
      const deselected = new Set(state.deselectedTurnKeys)
      if (deselected.has(key)) deselected.delete(key)
      else if (groupTranscriptTurns(state.transcript.messages).some(turn => turn.key === key)) deselected.add(key)
      else return
      cancel()
      publish({ deselectedTurnKeys: [...deselected], brief: '', referenceOnly: false, summaryFailed: false, error: null, phase: 'ready' })
    },
    selectAllTurns() {
      cancel()
      publish({ deselectedTurnKeys: [], brief: '', referenceOnly: false, summaryFailed: false, error: null, phase: state.transcript ? 'ready' : 'idle' })
    },
    clearTurns() {
      if (!state.transcript) return
      cancel()
      publish({ deselectedTurnKeys: groupTranscriptTurns(state.transcript.messages).map(turn => turn.key), brief: '', referenceOnly: false, summaryFailed: false, error: null, phase: 'ready' })
    },
    setTarget(target: HandoffTarget | null) { cancel(); publish({ target, phase: state.transcript ? 'ready' : 'idle', error: null }) },
    async pickDirectory() {
      try { const directory = await deps.pickDirectory?.(); if (directory) controller.setTarget({ kind: 'directory', directory }) }
      catch (error) { publish({ error: error instanceof Error ? error.message : '目录选择失败。' }) }
    },
    useOriginalReference() {
      if (!state.summaryFailed || !state.transcript) return
      cancel()
      publish({ referenceOnly: true, brief: `请先读取原始对话文件，核实背景与待办后再继续。${state.transcript.scope === 'loaded' ? '该文件仅包含已加载范围。' : ''}`, error: null })
    },
    async capture() {
      if (!state.available || !state.open) return
      const operation = begin('capture')
      publish({ transcript: null, deselectedTurnKeys: [], brief: '', allowPartial: false, referenceOnly: false, summaryFailed: false })
      try {
        const website = source()
        const captured = await website.capture(operation.signal)
        if (!current(operation) || deps.getWebsite() !== website) return
        // Website capture freezes the snapshot and owns its provenance by identity.
        publish({ transcript: captured, phase: 'ready' })
      } catch (error) { fail(operation, error) }
    },
    async summarize() {
      if (!state.available || !state.open || !scopeAccepted()) { publish({ error: '请先采集原文，并明确确认已加载范围。' }); return }
      const transcript = state.transcript!
      const filtered = filterTranscript(transcript, state.deselectedTurnKeys)
      if (!filtered.transcript.messages.length) { publish({ error: '请至少勾选一轮对话后再生成总结。' }); return }
      const selectedSource = state.source
      const model = state.models[state.modelIndex]
      const operation = begin('summary')
      let stopWatching: (() => void) | undefined
      try {
        const website = source()
        stopWatching = website.watchSource(transcript, reason => {
          if (!current(operation)) return
          operation.abort(reason)
          publish({ phase: 'ready', error: reason.message, summaryFailed: true })
        })
        await validate(website, transcript, operation)
        if (!current(operation)) return
        if (selectedSource === 'harness' && !model) throw new Error('请选择已配置的 HARNESS 模型。')
        const brief = await awaitWithCancellation(selectedSource === 'web' ? website.summarize(filtered.transcript, operation.signal)
          : deps.summarize({ transcript: filtered.transcript, provider: model!.provider, model: model!.model }, operation.signal), operation.signal)
        if (!current(operation)) return
        await validate(website, transcript, operation)
        if (!current(operation)) return
        if (!brief.trim()) throw new Error('总结为空，请重试或明确选择仅引用原文。')
        publish({ brief, phase: 'ready', summaryFailed: false, referenceOnly: false })
      } catch (error) { fail(operation, error, true) }
      finally { stopWatching?.() }
    },
    async transfer() {
      if (!state.available || !state.open || !scopeAccepted()) {
        publish({ error: '请完成采集、范围确认、简报和本地目标选择；总结失败后可明确选择仅引用原文。' }); return
      }
      const transcript = state.transcript!
      const filtered = filterTranscript(transcript, state.deselectedTurnKeys)
      if (!filtered.transcript.messages.length) { publish({ error: '请至少勾选一轮对话后再保存。' }); return }
      if (!state.target || !state.brief.trim() || (state.summaryFailed && !state.referenceOnly)) {
        publish({ error: '请完成采集、范围确认、简报和本地目标选择；总结失败后可明确选择仅引用原文。' }); return
      }
      const target = state.target
      const brief = state.brief
      const allowPartial = state.allowPartial
      const operation = begin('transfer')
      let stopWatching: (() => void) | undefined
      try {
        const website = source()
        // Delivery may intentionally open HARNESS before the legacy mount barrier.
        // URL, document and authentication changes still cancel every pending write.
        stopWatching = website.watchSource(transcript, reason => {
          if (!current(operation)) return
          operation.abort(reason)
          publish({ phase: 'ready', error: reason.message })
        }, { allowModeChange: true })
        await validate(website, transcript, operation)
        if (!current(operation)) return
        const exported = await deps.exportTranscript({ transcript: filtered.transcript, target, allowPartial }, operation.signal)
        if (!current(operation)) return
        await validate(website, transcript, operation)
        if (!current(operation)) return
        const result = await awaitWithCancellation(deps.deliver(target, exported, brief, operation.signal), operation.signal)
        if (!current(operation)) return
        publish({ phase: 'done', open: false, transcript: null, pendingInsertion: result.protected ? { sessionId: result.sessionId, text: handoffDraftText(brief, exported), exported, brief } : null })
        deps.onHarness()
      } catch (error) { fail(operation, error) }
      finally { stopWatching?.() }
    },
    insertPending(sessionId: string, actions: Pick<InputActions, 'captureInsertion' | 'insertText'>) {
      const pending = state.pendingInsertion
      if (!pending || pending.sessionId !== sessionId) return false
      if (!insertHandoffAtCursor(actions, pending.text)) { publish({ error: '输入框正在变化或忙碌，请重新定位光标后重试。' }); return false }
      publish({ pendingInsertion: null, error: null }); return true
    },
    async createNewFromPending() {
      const pending = state.pendingInsertion
      if (!pending || !state.available) return
      const operation = begin('transfer')
      try {
        const result = await deps.deliver({ kind: 'directory', directory: pending.exported.directory }, pending.exported, pending.brief, operation.signal)
        if (!current(operation)) return
        if (result.protected) throw new Error('新会话输入框不可用，请稍后重试。')
        publish({ pendingInsertion: null, phase: 'done', error: null }); deps.onHarness()
      } catch (error) { fail(operation, error) }
    },
    dismissPending() { publish({ pendingInsertion: null, error: null }) },
    dispose() { cancel(); cancelModels(); listeners.clear(); mountedInputs.clear(); disposed = true; state = { ...state, transcript: null, deselectedTurnKeys: [], brief: '', pendingInsertion: null, open: false } },
  }
  return controller
}
export type HandoffController = ReturnType<typeof createHandoffWorkflow>

function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Optional injection keeps original CHAT/HARNESS modes independent of SDK capability. */
export function createHandoffController(ctx: Context, getWebsite: () => WebsiteHandoffPort | null, onHarness: () => void): HandoffController {
  let active: Context | null = null
  let ended = false
  const required = () => { if (!active) throw new Error('本机交接服务暂不可用。'); return active }
  const controller = createHandoffWorkflow({
    getWebsite, onHarness,
    async options(signal) {
      const services = required()
      signal.throwIfAborted()
      const workspaces = services.workspaces.list.getSnapshot().items.map(row => ({ id: String(row.workspaceId), label: row.title, directory: row.path }))
      const catalog = services.sessions.list.getSnapshot()
      const sessions = catalog.ids.flatMap(id => {
        const row = catalog.byId[id]
        return row?.cwd && row.origin !== 'subagent' ? [{ id: String(id), label: row.displayTitle, directory: row.cwd }] : []
      })
      return { workspaces, sessions }
    },
    async models(signal) { return unwrap(await required().remote.dshChatHandoff.models(signal)) },
    async summarize(request, signal) { return unwrap(await required().remote.dshChatHandoff.summarize(request, signal)) },
    async exportTranscript(request, signal) { return unwrap(await required().remote.dshChatHandoff.exportTranscript(request, signal)) },
    async deliver(target, exported, brief, signal) {
      const services = required()
      return deliverHandoffDraft({ sessions: services.sessions, input: services.conversation.input, uiWorkspace: services.uiWorkspace, awaitMountedInput: controller.awaitSessionInput }, target, exported, brief, signal)
    },
    pickDirectory: () => required().uiWorkspace.pickDirectory(),
  })
  ctx.effect(() => {
    void (async () => {
      let unmount: (() => void | Promise<void>) | undefined
      let consumer: ReturnType<Context['inject']> | undefined
      try {
        unmount = await ctx.remote.$mount(DSH_HANDOFF_REMOTE_CONTRIBUTION)
        if (ended) { await unmount(); return }
        consumer = ctx.inject(['remote', 'remote.dshChatHandoff', 'sessions', 'conversation', 'uiWorkspace', 'workspaces'], ready => {
          ready.effect(() => {
            active = ready
            controller.setAvailable(true)
            return () => { if (active === ready) { active = null; controller.setAvailable(false) } }
          }, 'dsh-deepseek-chat handoff optional services')
        })
        await consumer
      } catch (error) {
        if (!ended) controller.setAvailable(false, error instanceof Error ? `交接服务不可用：${error.message}` : '交接服务不可用。')
      }
      if (ended) { await consumer?.dispose(); await unmount?.() }
      else {
        ctx.effect(() => async () => { await consumer?.dispose(); await unmount?.() }, 'dsh-deepseek-chat handoff remote cleanup')
      }
    })()
    return () => { ended = true; active = null; controller.dispose() }
  }, 'dsh-deepseek-chat independent handoff remote')
  return controller
}
