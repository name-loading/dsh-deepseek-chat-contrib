import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportTranscript, renderTranscriptMarkdown } from '../src/handoff-export.js'
import type { ChatTranscript } from '../src/handoff-types.js'

const transcript: ChatTranscript = {
  id: 'handoff-123', sourceUrl: 'https://chat.deepseek.com/a/chat/example', title: 'Example',
  capturedAt: 1_760_000_000_000, branchSignature: 'branch-1', scope: 'complete', scopeNote: 'All loaded',
  messages: [{ id: '1', role: 'user', markdown: 'Keep **Markdown**', attachments: ['report.pdf (website only)'] },
    { id: '2', role: 'assistant', markdown: '```ts\nconst n = 1\n```' }],
}

test('Markdown preserves provenance, roles, Markdown and attachment explanation', () => {
  const text = renderTranscriptMarkdown(transcript)
  for (const value of ['Example', 'https://chat.deepseek.com/a/chat/example', '2025-10-09T08:53:20.000Z',
    'complete', 'User', 'Assistant', 'Keep **Markdown**', '```ts\nconst n = 1\n```', 'report.pdf (website only)']) {
    assert.ok(text.includes(value), value)
  }
})

test('exports stable exclusive file under the resolved workspace and accepts identical retry', async () => {
  const root = await mkdtemp(join(process.cwd(), '.handoff-export-fixture-'))
  try {
    const services = { workspaceRegistry: { get: async (id: string) => {
      assert.equal(id, 'workspace-1'); return { id, path: root };
    } } }
    const request = { transcript, target: { kind: 'workspace' as const, workspaceId: 'workspace-1' }, allowPartial: false }
    const first = await exportTranscript(request, services, new AbortController().signal)
    assert.equal(first.directory, root)
    assert.equal(first.filePath, join(root, '.dsh', 'chat-handoffs', 'handoff-123', 'transcript.md'))
    assert.ok((await readFile(first.filePath, 'utf8')).includes('Keep **Markdown**'))
    assert.deepEqual(await exportTranscript(request, services, new AbortController().signal), first)
    await assert.rejects(exportTranscript({ ...request, transcript: { ...transcript, title: 'Changed' } }, services,
      new AbortController().signal), /already|conflict|different/i)
    assert.deepEqual(await readdir(join(root, '.dsh', 'chat-handoffs', transcript.id)), ['transcript.md'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects unaccepted partial, traversal, unknown origin, missing directory and cancelled exports', async () => {
  const signal = new AbortController().signal
  const request = { transcript, target: { kind: 'directory' as const, directory: tmpdir() }, allowPartial: false }
  await assert.rejects(exportTranscript({ ...request, transcript: { ...transcript, scope: 'loaded' } }, {}, signal), /partial|部分/i)
  await assert.rejects(exportTranscript({ ...request, transcript: { ...transcript, id: '../escape' } }, {}, signal))
  await assert.rejects(exportTranscript({ ...request, transcript: { ...transcript, sourceUrl: 'https://evil.example/a' } }, {}, signal))
  await assert.rejects(exportTranscript({ ...request, target: { kind: 'directory', directory: 'relative' } }, {}, signal))
  const abort = new AbortController(); abort.abort()
  await assert.rejects(exportTranscript(request, {}, abort.signal))
})

test('session target uses and closes the public read handle', async () => {
  const root = await mkdtemp(join(process.cwd(), '.handoff-session-fixture-'))
  let closed = false
  try {
    const result = await exportTranscript({ transcript, target: { kind: 'session', sessionId: 'session-1' }, allowPartial: false }, {
      sessionPersistence: { open: async (id: string, mode: string) => {
        assert.equal(id, 'session-1'); assert.equal(mode, 'read')
        return { header: { cwd: root }, close: async () => { closed = true } }
      } },
    }, new AbortController().signal)
    assert.equal(result.directory, root); assert.equal(closed, true)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('refuses a symbolic-link export container outside target', async t => {
  const root = await mkdtemp(join(process.cwd(), '.handoff-link-fixture-'))
  const outside = await mkdtemp(join(process.cwd(), '.handoff-outside-fixture-'))
  try {
    try { await symlink(outside, join(root, '.dsh'), process.platform === 'win32' ? 'junction' : 'dir') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('symlink unavailable'); return }; throw error }
    await assert.rejects(exportTranscript({ transcript, target: { kind: 'directory', directory: root }, allowPartial: false }, {},
      new AbortController().signal), /symbolic|symlink|outside|路径/i)
    assert.deepEqual(await readdir(outside), [])
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) }
})

test('cancelled session resolution settles promptly and closes a read handle that arrives late', async () => {
  let deliver!: (handle: { header: { cwd: string }; close(): Promise<void> }) => void
  const opening = new Promise<{ header: { cwd: string }; close(): Promise<void> }>(resolve => { deliver = resolve })
  let closed = false
  const abort = new AbortController()
  const pending = exportTranscript({ transcript, target: { kind: 'session', sessionId: 'late-session' }, allowPartial: false }, {
    sessionPersistence: { open: () => opening },
  }, abort.signal)
  setTimeout(() => abort.abort(), 10)
  const outcome = await Promise.race([pending.then(() => 'resolved', () => 'cancelled'), new Promise(resolve => setTimeout(() => resolve('hung'), 100))])
  deliver({ header: { cwd: tmpdir() }, close: async () => { closed = true } })
  await pending.catch(() => {}); await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(outcome, 'cancelled'); assert.equal(closed, true)
})

test('concurrent exports publish only one complete file with no temporary debris', async () => {
  const root = await mkdtemp(join(process.cwd(), '.handoff-concurrent-fixture-'))
  try {
    const request = { transcript, target: { kind: 'directory' as const, directory: root }, allowPartial: false }
    const results = await Promise.all([exportTranscript(request, {}, new AbortController().signal), exportTranscript(request, {}, new AbortController().signal)])
    assert.equal(results[0].filePath, results[1].filePath)
    assert.ok((await readFile(results[0].filePath, 'utf8')).endsWith('```\n\n'))
    assert.deepEqual(await readdir(join(root, '.dsh', 'chat-handoffs')), ['handoff-123'])
  } finally { await rm(root, { recursive: true, force: true }) }
})
