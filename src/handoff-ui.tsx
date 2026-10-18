import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { HandoffController, HandoffViewState } from './handoff-client.js'
import { groupTranscriptTurns, type TranscriptTurn } from './handoff-group.js'

export interface HandoffProps { readonly controller: HandoffController }
export function useHandoff(controller: HandoffController): HandoffViewState {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
}

interface TranscriptPreviewProps {
  readonly turns: readonly TranscriptTurn[]
  readonly deselected: ReadonlySet<string>
  readonly disabled: boolean
  readonly onToggle: (key: string) => void
}

/** Collapsible per-turn transcript; every turn carries a selection checkbox. */
function TranscriptPreview({ turns, deselected, disabled, onToggle }: TranscriptPreviewProps) {
  return <details className="dsh-chat-handoff-transcript">
    <summary>查看采集原文（{turns.length} 轮对话，按用户消息折叠）</summary>
    <div className="dsh-chat-handoff-preview">
      {turns.map((turn, index) => <details key={turn.key} className="dsh-chat-handoff-turn">
        <summary>
          <input type="checkbox" className="dsh-chat-handoff-turn-check" aria-label={`选择第 ${index + 1} 轮对话`}
            checked={!deselected.has(turn.key)} disabled={disabled}
            onClick={event => event.stopPropagation()} onChange={() => onToggle(turn.key)} />
          <span className="dsh-chat-handoff-turn-index">{index + 1}</span>
          <span className="dsh-chat-handoff-turn-title">{turn.title}</span>
        </summary>
        <div className="dsh-chat-handoff-turn-body">
          {turn.messages.map(message => <article key={message.id} className="dsh-chat-handoff-message">
            <div className="dsh-chat-handoff-role">{message.role === 'user' ? '用户' : 'DeepSeek'}</div>
            <pre>{message.markdown}</pre>
            {!!message.attachments?.length && <p>附件说明：{message.attachments.join('；')}</p>}
          </article>)}
        </div>
      </details>)}
    </div>
  </details>
}

/** Mounted in shell.overlay; capture and every billable operation require a user action. */
export function DshChatHandoffDialog({ controller }: HandoffProps) {
  const state = useHandoff(controller)
  const busy = ['options', 'capture', 'summary', 'transfer'].includes(state.phase)
  const transcript = state.transcript
  const turns = useMemo(() => transcript ? groupTranscriptTurns(transcript.messages) : [], [transcript])
  const deselected = useMemo(() => new Set(state.deselectedTurnKeys), [state.deselectedTurnKeys])
  const selectedCount = turns.filter(turn => !deselected.has(turn.key)).length
  const scopeAccepted = transcript && (transcript.scope === 'complete' || state.allowPartial)
  const targetValue = state.target?.kind === 'workspace' ? `workspace:${state.target.workspaceId}`
    : state.target?.kind === 'session' ? `session:${state.target.sessionId}` : state.target?.kind === 'directory' ? 'directory' : ''
  const labels = { options: '正在读取本地目标…', capture: '正在采集当前分支…', summary: '正在总结…', transfer: '正在保存原文并准备草稿…' }
  // This dialog only summarizes through a configured HARNESS model; the website
  // summary source stays hidden until that path is enabled again.
  const captureHint = !state.available ? ''
    : transcript ? (scopeAccepted ? (selectedCount ? '' : '请至少勾选一轮对话。') : '请勾选“我确认仅交接当前已加载范围”，然后才能生成总结。')
      : '请先点击“采集当前分支”，采集完成后才能生成总结。'
  return <Modal open={state.open} onClose={() => controller.close()} title="交给 Harness" closeLabel="关闭交接"
    description="采集当前 CHAT 分支，用 HARNESS 已配置模型生成可编辑简报，保存原文并打开 HARNESS 草稿；由你检查后手动发送。"
    className="dsh-chat-handoff-modal" contentClassName="dsh-chat-handoff-content"
    footer={<><Button onClick={() => controller.close()}>取消</Button>{busy
      ? <Button onClick={() => controller.cancel()}>停止当前操作</Button>
      : <Button variant="primary" disabled={!state.available || !scopeAccepted || !selectedCount || !state.target || !state.brief.trim() || (state.summaryFailed && !state.referenceOnly)} onClick={() => { void controller.transfer() }}>保存并打开 HARNESS 草稿</Button>}</>}>
    <div className="dsh-chat-handoff-body">
      {!state.available && <p role="status">{state.availabilityMessage}</p>}
      {busy && <p role="status" aria-live="polite">{labels[state.phase as keyof typeof labels]}</p>}
      {state.error && <p role="alert" className="dsh-chat-handoff-error">{state.error}</p>}
      <section aria-label="采集当前分支" className="dsh-chat-handoff-capture">
        <div className="dsh-chat-handoff-capture-row">
          <Button variant={transcript ? 'outline' : 'primary'} disabled={!state.available || busy} onClick={() => { void controller.capture() }}>{transcript ? '重新采集当前分支' : '采集当前分支'}</Button>
          {captureHint && <span className="dsh-chat-handoff-hint">{captureHint}</span>}
        </div>
        <p>仅读取你当前打开的官网分支；切换对话或分支后需要重新采集。源附件仅记录说明和已知路径。</p>
        {transcript && <div>
          <p><strong>{transcript.title}</strong> · {turns.length} 轮对话 · {transcript.scope === 'complete' ? '完整范围' : '已加载范围'}</p>
          <p>{transcript.scopeNote}</p>
          {transcript.scope === 'loaded' && <label className="dsh-chat-handoff-checkbox"><input type="checkbox" aria-label="仅交接当前已加载范围" checked={state.allowPartial} disabled={busy} onChange={event => controller.setAllowPartial(event.target.checked)} />我确认仅交接当前已加载范围，未加载的历史不在原文文件内。</label>}
          <div className="dsh-chat-handoff-turn-toolbar">
            <span>已选 {selectedCount}/{turns.length} 轮对话</span>
            <Button variant="ghost" size="sm" disabled={busy || selectedCount === turns.length} onClick={() => controller.selectAllTurns()}>全选</Button>
            <Button variant="ghost" size="sm" disabled={busy || selectedCount === 0} onClick={() => controller.clearTurns()}>清空</Button>
          </div>
          <TranscriptPreview turns={turns} deselected={deselected} disabled={busy} onToggle={key => controller.toggleTurn(key)} />
        </div>}
      </section>
      <section aria-label="总结模型" className="dsh-chat-handoff-model">
        <label>HARNESS 总结模型 <select aria-label="HARNESS 总结模型" disabled={state.modelsLoading || !state.models.length} value={state.modelIndex} onChange={event => controller.setModel(Number(event.target.value))}>
          {state.models.length === 0 && <option value={0}>暂无可用模型</option>}
          {state.models.map((model, index) => <option key={`${model.provider}/${model.model}`} value={index}>{model.label} · {model.provider}/{model.model}</option>)}
        </select></label>
        {state.modelsLoading && <p role="status">正在读取 HARNESS 模型…</p>}
        {state.modelsError && <p role="status">{state.modelsError}</p>}
        <div><Button variant="outline" size="sm" disabled={state.modelsLoading} onClick={() => { void controller.refreshModels() }}>刷新模型列表</Button></div>
        <p>将把采集原文发送给所选 HARNESS 模型；可能产生该提供商的 API 用量或费用。当前版本暂不提供官网对话总结。</p>
      </section>
      <fieldset disabled={!state.available || busy || !scopeAccepted || selectedCount === 0} className="dsh-chat-handoff-fields" style={{ display: 'grid', gap: 10 }}>
        <legend>总结与简报</legend>
        <div><Button disabled={state.modelsLoading || !state.models.length} onClick={() => { void controller.summarize() }}>生成总结</Button></div>
        {state.summaryFailed && <div><p>总结失败；原文和预览仍保留。可以重试，或明确选择仅引用原文。</p><Button onClick={() => controller.useOriginalReference()}>仅引用原文，不再生成总结</Button></div>}
        <label>可编辑的交接简报<textarea aria-label="交接简报" value={state.brief} rows={8} onChange={event => controller.setBrief(event.target.value)} /></label>
      </fieldset>
      <fieldset disabled={!state.available || busy} className="dsh-chat-handoff-fields" style={{ display: 'grid', gap: 10 }}>
        <legend>本地目标</legend>
        <label>工作区或会话 <select aria-label="交接本地目标" value={targetValue} onChange={event => {
          const value = event.target.value
          if (value.startsWith('workspace:')) controller.setTarget({ kind: 'workspace', workspaceId: value.slice(10) })
          else if (value.startsWith('session:')) controller.setTarget({ kind: 'session', sessionId: value.slice(8) })
          else controller.setTarget(value === 'directory' ? { kind: 'directory', directory: '' } : null)
        }}><option value="">请选择本地目标</option>
          <optgroup label="在工作区新建会话">{state.workspaces.map(item => <option key={item.id} value={`workspace:${item.id}`}>{item.label} · {item.directory}</option>)}</optgroup>
          <optgroup label="已有本机会话">{state.sessions.map(item => <option key={item.id} value={`session:${item.id}`}>{item.label} · {item.directory}</option>)}</optgroup>
          <option value="directory">指定本机绝对目录并新建会话</option>
        </select></label>
        {state.target?.kind === 'directory' && <label>本机绝对目录<input aria-label="本机绝对目录" value={state.target.directory} placeholder="C:\项目 或 /path/to/project" onChange={event => controller.setTarget({ kind: 'directory', directory: event.target.value })} /><Button onClick={() => { void controller.pickDirectory() }}>选择目录</Button></label>}
        <p>原文稳定保存在目标目录的 <code>.dsh/chat-handoffs/…/transcript.md</code>。草稿只放简报和文件引用。已有草稿、引用和附件会保留；打开目标后可在光标处插入或另建会话。</p>
      </fieldset>
    </div>
  </Modal>
}

/** Register in the official session-scoped conversation.input.left slot. */
export function DshChatHandoffInsertion({ controller, sessionId, inputActions, useInput }: HandoffProps & { readonly sessionId: string } & PropsRuntime<'conversation.input.left'>) {
  const state = useHandoff(controller)
  const phase = useInput(input => input.phase)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let release: (() => void) | undefined
    // The resident rc.2 view restores persisted text in a passive effect.
    // A microtask after the same effect flush observes that restored input.
    queueMicrotask(() => { if (!cancelled) release = controller.sessionInputMounted(sessionId) })
    return () => { cancelled = true; release?.() }
  }, [controller, sessionId, inputActions])
  if (!state.pendingInsertion || state.pendingInsertion.sessionId !== String(sessionId)) return null
  return <div className="dsh-chat-handoff-insertion" role="status">
    <span>交接已准备好，当前草稿已保留。</span>
    <Button disabled={phase !== 'plain' || state.phase === 'transfer'} onClick={() => {
      if (controller.insertPending(String(sessionId), inputActions)) setError(null)
      else setError('草稿已变化或输入框正忙，请重新定位光标后重试。')
    }}>在光标处插入交接</Button>
    <Button disabled={state.phase === 'transfer'} onClick={() => { void controller.createNewFromPending() }}>另建会话</Button>
    <Button disabled={state.phase === 'transfer'} onClick={() => controller.dismissPending()}>放弃插入</Button>
    {(error || state.error) && <span role="alert">{error || state.error}</span>}
  </div>
}
