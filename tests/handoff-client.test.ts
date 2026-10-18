import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandoffController, createHandoffWorkflow } from '../src/handoff-client.js'
import type { Context } from '@deepseek-ai/cordis'
import type { ChatTranscript, ExportTranscriptRequest, SummaryModel, SummarizeTranscriptRequest, WebsiteHandoffPort } from '../src/handoff-types.js'

const transcript: ChatTranscript = { id: 'capture', title: 'Fixture chat', sourceUrl: 'https://chat.deepseek.com/a', capturedAt: 1, branchSignature: 'branch', scope: 'complete', scopeNote: 'all', messages: [{ id: 'm', role: 'user', markdown: 'original content' }] }
const pairedTranscript: ChatTranscript = { ...transcript, scope: 'complete', scopeNote: '完整范围', messages: [
  { id: 'u1', role: 'user', markdown: 'first question' },
  { id: 'a1', role: 'assistant', markdown: 'first answer' },
  { id: 'u2', role: 'user', markdown: 'second question' },
  { id: 'a2', role: 'assistant', markdown: 'second answer' },
] }

test('source invalidation aborts pending target delivery and discards its late result', async () => {
  let invalid: ((reason: Error) => void) | undefined, signal: AbortSignal | undefined, release!: (value: {sessionId:string;protected:boolean}) => void, started!: () => void, unsubscribed=0
  const ready=new Promise<void>(resolve=>{started=resolve})
  const {workflow,events}=setup({watchSource(_transcript,onInvalid,options){assert.equal(options?.allowModeChange,true);invalid=onInvalid;return()=>{unsubscribed++}},deliver(active){signal=active;started();return new Promise(resolve=>{release=resolve})}})
  await workflow.open();await workflow.capture();workflow.setBrief('reviewed brief')
  const pending=workflow.transfer();await ready
  invalid?.(new Error('source account changed'))
  release({sessionId:'late',protected:false});await pending
  assert.equal(signal?.aborted,true);assert.equal(workflow.getSnapshot().phase,'ready');assert.equal(workflow.getSnapshot().transcript,transcript);assert.match(workflow.getSnapshot().error!,/source account changed/);assert.equal(events.includes('harness'),false);assert.equal(unsubscribed,1)
})
interface SetupOptions { capture?: () => Promise<ChatTranscript>; summarize?: () => Promise<string>; validate?: () => Promise<void>; deliver?: (signal: AbortSignal) => Promise<{ sessionId: string; protected: boolean }>; watchSource?: WebsiteHandoffPort['watchSource']; remoteSummary?: (signal: AbortSignal) => Promise<string>; models?: () => Promise<SummaryModel[]>; onSummaryRequest?: (request: SummarizeTranscriptRequest) => void; onExportRequest?: (request: ExportTranscriptRequest) => void }
function setup(options: SetupOptions = {}) {
  const events: string[] = []
  const website: WebsiteHandoffPort = {
    capture: options.capture ?? (async () => { events.push('capture'); return transcript }),
    validate: options.validate ?? (async () => { events.push('validate') }),
    summarize: options.summarize ?? (async () => { events.push('web-summary'); return 'editable brief' }),
    watchSource: options.watchSource ?? (() => () => {}),
  }
  const workflow = createHandoffWorkflow({
    getWebsite: () => website,
    options: async () => ({ workspaces: [{ id: 'w', label: 'Local', directory: '/project' }], sessions: [] }),
    models: options.models ?? (async () => [{ provider: 'p', model: 'm', label: 'Configured' }]),
    summarize: async (request, signal) => { options.onSummaryRequest?.(request); events.push('api-summary'); return options.remoteSummary ? options.remoteSummary(signal) : 'API brief' },
    exportTranscript: async request => { options.onExportRequest?.(request); events.push('export'); return { directory: '/project', filePath: '/project/.dsh/chat-handoffs/a/transcript.md' } },
    deliver: options.deliver ? async (_target, _exported, _brief, signal) => options.deliver!(signal) : (async () => { events.push('draft'); return { sessionId: 'new', protected: false } }),
    onHarness: () => events.push('harness'),
  })
  workflow.setAvailable(true)
  return { workflow, events }
}

test('opening reads choices only; capture, summary and draft are explicit; frozen original exported and no raw text in brief', async () => {
  const { workflow, events } = setup()
  await workflow.open()
  assert.deepEqual(events, [])
  workflow.setSource('web')
  await workflow.capture()
  assert.equal(workflow.getSnapshot().transcript?.title, 'Fixture chat')
  assert.deepEqual(events, ['capture'])
  await workflow.summarize()
  assert.equal(workflow.getSnapshot().brief, 'editable brief')
  workflow.setBrief('my revised brief')
  await workflow.transfer()
  assert.deepEqual(events, ['capture', 'validate', 'web-summary', 'validate', 'validate', 'export', 'validate', 'draft', 'harness'])
  assert.equal(workflow.getSnapshot().phase, 'done')
})

test('summary failure preserves snapshot and preview; no API fallback or target creation; reference mode is explicit', async () => {
  const { workflow, events } = setup({ summarize: async () => { throw new Error('website refused') } })
  await workflow.open(); workflow.setSource('web'); await workflow.capture(); await workflow.summarize()
  assert.equal(workflow.getSnapshot().transcript?.id, 'capture')
  assert.match(workflow.getSnapshot().error!, /website refused/)
  await workflow.transfer()
  assert.equal(events.includes('export'), false)
  assert.equal(events.includes('api-summary'), false)
  workflow.useOriginalReference()
  await workflow.transfer()
  assert.ok(events.includes('draft'))
})

test('partial snapshot blocks both model request and export until explicit checkbox acceptance', async () => {
  const { workflow, events } = setup({ capture: async () => ({ ...transcript, scope: 'loaded', scopeNote: 'only visible' }) })
  await workflow.open(); workflow.setSource('web'); await workflow.capture(); await workflow.summarize(); await workflow.transfer()
  assert.equal(events.includes('web-summary'), false)
  assert.equal(events.includes('export'), false)
  workflow.setAllowPartial(true)
  await workflow.summarize(); await workflow.transfer()
  assert.ok(events.includes('export'))
})

test('closing cancels late capture and summary so they cannot restore closed preview or open a target', async () => {
  let resolve!: (value: ChatTranscript) => void
  const { workflow, events } = setup({ capture: () => new Promise(done => { resolve = done }) })
  await workflow.open()
  const pending = workflow.capture()
  workflow.close(); resolve(transcript); await pending
  assert.equal(workflow.getSnapshot().open, false)
  assert.equal(workflow.getSnapshot().transcript, null)
  assert.deepEqual(events, [])
})

test('source change cancels in-flight web summary, never switches to billable API implicitly', async () => {
  let resolve!: (value: string) => void
  let started!: () => void
  const summaryStarted = new Promise<void>(done => { started = done })
  const { workflow, events } = setup({ summarize: () => new Promise(done => { resolve = done; started() }) })
  await workflow.open(); workflow.setSource('web'); await workflow.capture()
  const pending = workflow.summarize()
  await summaryStarted
  workflow.setSource('harness'); resolve('late website answer'); await pending
  assert.equal(workflow.getSnapshot().brief, '')
  assert.equal(workflow.getSnapshot().source, 'harness')
  assert.equal(events.includes('api-summary'), false)
})

test('stale source validation prevents export and session creation', async () => {
  let stale = false
  const { workflow, events } = setup({ validate: async () => { if (stale) throw new Error('source changed') } })
  await workflow.open(); await workflow.capture(); await workflow.summarize()
  stale = true
  await workflow.transfer()
  assert.equal(events.includes('export'), false)
  assert.equal(events.includes('draft'), false)
})

test('protected target yields only a session-scoped pending insertion and keeps handoff text', async () => {
  const { workflow } = setup({ deliver: async () => ({ sessionId: 'existing', protected: true }) })
  await workflow.open(); await workflow.capture(); await workflow.summarize(); await workflow.transfer()
  assert.equal(workflow.getSnapshot().pendingInsertion?.sessionId, 'existing')
  assert.match(workflow.getSnapshot().pendingInsertion!.text, /API brief/)
  assert.equal(workflow.getSnapshot().open, false)
})

test('mount barrier resolves only its target session and cancels stale waiting work', async () => {
  const { workflow } = setup()
  const abort = new AbortController()
  const pending = workflow.awaitSessionInput('target', abort.signal)
  const releaseOther = workflow.sessionInputMounted('other')
  let settled = false
  void pending.then(() => { settled = true }, () => {})
  await Promise.resolve()
  assert.equal(settled, false)
  abort.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  releaseOther()
  const releaseTarget = workflow.sessionInputMounted('target')
  await workflow.awaitSessionInput('target', new AbortController().signal)
  releaseTarget()
})

test('missing optional services reports unavailable without capturing, summarizing, or creating a target', async () => {
  const { workflow, events } = setup()
  workflow.setAvailable(false)
  await workflow.open(); await workflow.capture(); await workflow.summarize(); await workflow.transfer()
  assert.equal(workflow.getSnapshot().available, false)
  assert.match(workflow.getSnapshot().availabilityMessage, /未提供/)
  assert.deepEqual(events, [])
})

test('opening starts Harness model discovery in the background without blocking local targets', async () => {
  let modelCalls = 0
  const cleanups: (() => void)[] = []
  const fixture = {
    remote: { $mount: async () => () => {}, dshChatHandoff: { models: () => { modelCalls++; return new Promise(() => {}) } } },
    workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: 'w', title: 'Local workspace', path: '/project' }] }) } },
    sessions: { list: { getSnapshot: () => ({ ids: ['s'], byId: { s: { displayTitle: 'Existing session', cwd: '/project', origin: 'user' } } }) } },
    conversation: {}, uiWorkspace: {},
    effect(callback: () => unknown) { const cleanup = callback(); if (typeof cleanup === 'function') cleanups.push(cleanup as () => void) },
    inject(_names: string[], callback: (ctx: unknown) => void) { callback(fixture); return Promise.resolve() },
  }
  const website: WebsiteHandoffPort = { capture: async () => transcript, validate: async () => {}, summarize: async () => 'Website brief', watchSource: () => () => {} }
  const controller = createHandoffController(fixture as unknown as Context, () => website, () => {})
  for (let index = 0; index < 10; index++) await Promise.resolve()
  try {
    await Promise.race([controller.open(), new Promise((_, reject) => setTimeout(() => reject(new Error('local targets waited for model discovery')), 100))])
    assert.equal(controller.getSnapshot().workspaces[0]?.id, 'w')
    assert.equal(controller.getSnapshot().sessions[0]?.id, 's')
    assert.equal(modelCalls, 1)
    assert.equal(controller.getSnapshot().modelsLoading, true)
    controller.setSource('web')
    await controller.capture(); await controller.summarize()
    assert.equal(controller.getSnapshot().brief, 'Website brief')
  } finally { controller.dispose() }
})

test('opening loads Harness models for the API summary', async () => {
  const { workflow, events } = setup()
  await workflow.open(); await workflow.capture()
  for (let index = 0; index < 5; index++) await Promise.resolve()
  assert.equal(workflow.getSnapshot().models.length, 1)
  await workflow.summarize()
  assert.equal(workflow.getSnapshot().brief, 'API brief')
  assert.equal(events.includes('api-summary'), true)
  assert.equal(workflow.getSnapshot().workspaces[0]?.id, 'w')
})

test('model discovery failure is separate from local targets and the hidden website summary path', async () => {
  const { workflow } = setup({ models: async () => { throw new Error('model endpoint unavailable') } })
  await workflow.open(); await workflow.capture()
  for (let index = 0; index < 5; index++) await Promise.resolve()
  assert.match(workflow.getSnapshot().modelsError!, /模型/)
  assert.equal(workflow.getSnapshot().available, true)
  assert.equal(workflow.getSnapshot().workspaces[0]?.id, 'w')
  workflow.setSource('web'); await workflow.summarize()
  assert.equal(workflow.getSnapshot().brief, 'editable brief')
})

test('source invalidation cancels in-flight Harness work, preserves capture, and discards late results', async () => {
  let invalidate!: (reason: Error) => void
  let released = 0
  let modelSignal!: AbortSignal
  let started!: () => void
  const active = new Promise<void>(resolve => { started = resolve })
  let finish!: (brief: string) => void
  const { workflow } = setup({
    watchSource: (_transcript, callback) => { invalidate = callback; return () => { released++ } },
    remoteSummary: signal => { modelSignal = signal; started(); return new Promise(resolve => { finish = resolve }) },
  })
  await workflow.open(); await workflow.capture(); workflow.setSource('harness')
  for (let index = 0; index < 5; index++) await Promise.resolve()
  const pending = workflow.summarize(); await Promise.race([active, new Promise((_, reject) => setTimeout(() => reject(new Error('Harness summary did not start')), 100))])
  invalidate(new Error('来源网页已经变化，请重新采集。'))
  assert.equal(modelSignal.aborted, true)
  assert.equal(workflow.getSnapshot().phase, 'ready')
  assert.match(workflow.getSnapshot().error!, /来源网页/)
  assert.equal(workflow.getSnapshot().transcript, transcript)
  await Promise.race([pending, new Promise((_, reject) => setTimeout(() => reject(new Error('cancelled summary did not settle')), 100))])
  assert.equal(released, 1)
  finish('late model brief'); await Promise.resolve()
  assert.equal(workflow.getSnapshot().brief, '')
})

test('Harness brief is not adopted if source validation fails after the model returns', async () => {
  let validations = 0
  const { workflow } = setup({ validate: async () => { if (++validations > 1) throw new Error('branch changed') } })
  await workflow.open(); await workflow.capture(); workflow.setSource('harness')
  for (let index = 0; index < 5; index++) await Promise.resolve()
  await workflow.summarize()
  assert.equal(workflow.getSnapshot().brief, '')
  assert.equal(workflow.getSnapshot().summaryFailed, true)
  assert.match(workflow.getSnapshot().error!, /branch changed/)
})

test('unchecked turns are removed from the summary request and the exported transcript', async () => {
  let summaryRequest: SummarizeTranscriptRequest | undefined
  let exportRequest: ExportTranscriptRequest | undefined
  const { workflow, events } = setup({
    capture: async () => pairedTranscript,
    onSummaryRequest: request => { summaryRequest = request },
    onExportRequest: request => { exportRequest = request },
  })
  await workflow.open(); await workflow.capture()
  for (let index = 0; index < 5; index++) await Promise.resolve()
  workflow.toggleTurn('u2')
  assert.equal(workflow.getSnapshot().brief, '')
  await workflow.summarize()
  assert.deepEqual(summaryRequest?.transcript.messages.map(item => item.id), ['u1', 'a1'])
  assert.match(summaryRequest?.transcript.scopeNote ?? '', /1\/2 轮对话/)
  workflow.setBrief('selected brief')
  await workflow.transfer()
  assert.deepEqual(exportRequest?.transcript.messages.map(item => item.id), ['u1', 'a1'])
  assert.equal(events.includes('export'), true)
})

test('changing turn selection clears a generated brief; select-all restores the full transcript', async () => {
  let summaryRequest: SummarizeTranscriptRequest | undefined
  const { workflow } = setup({ capture: async () => pairedTranscript, onSummaryRequest: request => { summaryRequest = request } })
  await workflow.open(); await workflow.capture()
  for (let index = 0; index < 5; index++) await Promise.resolve()
  await workflow.summarize()
  assert.equal(workflow.getSnapshot().brief, 'API brief')
  workflow.toggleTurn('u1')
  assert.equal(workflow.getSnapshot().brief, '')
  workflow.selectAllTurns()
  await workflow.summarize()
  assert.deepEqual(summaryRequest?.transcript.messages.map(item => item.id), ['u1', 'a1', 'u2', 'a2'])
})

test('clearing every turn blocks summary and export with an explicit hint', async () => {
  const { workflow, events } = setup({ capture: async () => pairedTranscript })
  await workflow.open(); await workflow.capture()
  workflow.setAllowPartial(true)
  for (let index = 0; index < 5; index++) await Promise.resolve()
  workflow.clearTurns()
  await workflow.summarize()
  assert.match(workflow.getSnapshot().error!, /至少勾选/)
  await workflow.transfer()
  assert.match(workflow.getSnapshot().error!, /至少勾选/)
  assert.equal(events.includes('api-summary'), false)
  assert.equal(events.includes('export'), false)
})
