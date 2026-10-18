import test from 'node:test'
import assert from 'node:assert/strict'
import { deliverHandoffDraft, insertHandoffAtCursor, handoffDraftText } from '../src/handoff-session.js'

function fixture(inputState = { draft: '', attachmentIds: [] as string[], occurrences: [] as object[], phase: 'plain' }) {
  const events: unknown[] = []
  const binding = { ctx: { tag: 'target-scope' } }
  const deps = {
    sessions: {
      create: async (options: unknown) => { events.push(['create', options]); return 'new-session' },
      retain: (id: string, options: unknown) => {
        events.push(['retain', id, options])
        return { ready: Promise.resolve(binding), release: () => events.push(['release']) }
      },
    },
    input: { for: (scope: unknown) => {
      assert.equal(scope, binding.ctx)
      return { state: { getSnapshot: () => inputState }, setDraft: (text: string) => events.push(['draft', text]), submit: () => assert.fail('must never submit') }
    } },
    uiWorkspace: { openSession: (id: string) => events.push(['open', id]) },
    awaitMountedInput: async () => { events.push(['mounted']) },
  }
  return { deps: deps as never, events, inputState }
}

test('new handoff creates with Host resolved cwd, seeds empty draft, opens before releasing, never submits', async () => {
  const { deps, events } = fixture()
  const result = await deliverHandoffDraft(deps, { kind: 'workspace', workspaceId: 'w' }, { directory: 'C:\\project', filePath: 'C:\\project\\.dsh\\chat-handoffs\\a\\transcript.md' }, 'brief', new AbortController().signal)
  assert.deepEqual(result, { sessionId: 'new-session', protected: false })
  assert.deepEqual(events.map(e => (e as unknown[])[0]), ['create', 'retain', 'open', 'mounted', 'draft', 'release'])
  assert.deepEqual((events[0] as unknown[])[1], { workspaceId: 'w', cwd: 'C:\\project' })
  assert.match(String((events[4] as unknown[])[1]), /brief\n\n原始对话：@C:\/project\/\.dsh\/chat-handoffs\/a\/transcript\.md/)
})

test('existing rich or attached draft is protected even when text projection is empty', async () => {
  for (const state of [
    { draft: 'keep selected text', attachmentIds: [], occurrences: [], phase: 'plain' },
    { draft: '', attachmentIds: ['attachment'], occurrences: [], phase: 'plain' },
    { draft: '', attachmentIds: [], occurrences: [{}], phase: 'plain' },
    { draft: '', attachmentIds: [], occurrences: [], phase: 'submitting' },
  ]) {
    const { deps, events } = fixture(state)
    assert.deepEqual(await deliverHandoffDraft(deps, { kind: 'session', sessionId: 'existing' }, { directory: '/project', filePath: '/project/.dsh/chat-handoffs/a/transcript.md' }, 'brief', new AbortController().signal), { sessionId: 'existing', protected: true })
    assert.deepEqual(events.map(e => (e as unknown[])[0]), ['retain', 'open', 'mounted', 'release'])
  }
})

test('cursor insertion collapses semantic selection at end, preserves selected text/chips and obeys revision rejection', () => {
  const selected = { start: 1, end: 3, draftRev: 42 }
  let received: unknown
  const actions = {
    captureInsertion: () => selected,
    insertText: (text: string, span: unknown) => { received = { text, span }; return false },
  }
  assert.equal(insertHandoffAtCursor(actions, 'brief'), false)
  assert.deepEqual(received, { text: '\n\nbrief\n\n', span: { start: 3, end: 3, draftRev: 42 } })
  assert.deepEqual(selected, { start: 1, end: 3, draftRev: 42 })
})

test('already cancelled target work does not retain, seed, or open a session', async () => {
  const { deps, events } = fixture()
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(deliverHandoffDraft(deps, { kind: 'session', sessionId: 'existing' }, { directory: '/p', filePath: '/p/t.md' }, 'brief', abort.signal))
  assert.deepEqual(events, [])
})

test('file reference quotes paths with spaces and rejects outside cwd', () => {
  assert.equal(handoffDraftText('brief', { directory: 'C:\\project', filePath: 'C:\\project\\.dsh\\handoff folder\\transcript.md' }), 'brief\n\n原始对话：@"C:/project/.dsh/handoff folder/transcript.md"')
  assert.throws(() => handoffDraftText('brief', { directory: '/project', filePath: '/other/t.md' }))
})

test('a file path outside public mention grammar stays visible as a full absolute address', () => {
  assert.equal(handoffDraftText('brief', { directory: '/project', filePath: '/project/a"quote/transcript.md' }), 'brief\n\n原始对话文件（绝对路径）：/project/a"quote/transcript.md')
})

test('rc2 waits for official session mount restoration before inspecting or writing an apparently empty draft', async () => {
  const { deps, events, inputState } = fixture()
  ;(deps as any).awaitMountedInput = async () => { events.push(['restored']); inputState.draft = 'persisted existing draft' }
  const result = await deliverHandoffDraft(deps, { kind: 'session', sessionId: 'existing' }, { directory: '/p', filePath: '/p/t.md' }, 'brief', new AbortController().signal)
  assert.equal(result.protected, true)
  assert.deepEqual(events.map(e => (e as unknown[])[0]), ['retain', 'open', 'restored', 'release'])
  assert.equal(inputState.draft, 'persisted existing draft')
})

test('rc1 uses synchronous public initialization admission and preserves a draft it reports as preserved', async () => {
  const { deps, events } = fixture()
  ;(deps as any).input.requestDraftInitialization = (_binding: unknown, options: unknown) => { events.push(['initialize', options]); return 'preserved' }
  const result = await deliverHandoffDraft(deps, { kind: 'session', sessionId: 'existing' }, { directory: '/p', filePath: '/p/t.md' }, 'brief', new AbortController().signal)
  assert.equal(result.protected, true)
  assert.deepEqual(events.map(e => (e as unknown[])[0]), ['retain', 'initialize', 'open', 'release'])
})

test('rc1 admission applies the brief exactly once without direct whole-draft writes', async () => {
  const { deps, events } = fixture()
  ;(deps as any).input.requestDraftInitialization = (_binding: unknown, options: unknown) => { events.push(['initialize', options]); return 'applied' }
  const result = await deliverHandoffDraft(deps, { kind: 'session', sessionId: 'existing' }, { directory: '/p', filePath: '/p/t.md' }, 'brief', new AbortController().signal)
  assert.equal(result.protected, false)
  assert.deepEqual(events.map(e => (e as unknown[])[0]), ['retain', 'initialize', 'open', 'release'])
  assert.deepEqual((events[1] as unknown[])[1], { prompt: 'brief\n\n原始对话：@/p/t.md', clearPreviousDraft: false })
})

test('cancelling after retained scope becomes ready releases its lease without opening or changing draft', async () => {
  const { deps, events } = fixture()
  const abort = new AbortController()
  let ready!: (value: unknown) => void
  ;(deps as any).sessions.retain = () => ({ ready: new Promise(done => { ready = done }), release: () => events.push(['release']) })
  const pending = deliverHandoffDraft(deps, { kind: 'session', sessionId: 'existing' }, { directory: '/p', filePath: '/p/t.md' }, 'brief', abort.signal)
  abort.abort(); ready({ ctx: {} })
  await assert.rejects(pending, { name: 'AbortError' })
  assert.deepEqual(events, [['release']])
})
