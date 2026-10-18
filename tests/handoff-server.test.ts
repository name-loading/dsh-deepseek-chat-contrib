import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DSH_HANDOFF_DESCRIPTORS, exportTranscriptRequestSchema, summarizeTranscriptRequestSchema } from '../src/handoff-protocol.js'

const transcript = { id: 'handoff-1', sourceUrl: 'https://chat.deepseek.com/a/chat/123', title: 'Title',
  capturedAt: 1760000000000, branchSignature: 'branch-1', scope: 'loaded', scopeNote: 'Only loaded messages',
  messages: [{ id: 'm1', role: 'user', markdown: 'hello' }] }

test('strict handoff schemas reject unknown fields, wrong origins, traversal and oversize payloads', () => {
  const valid = { transcript, provider: 'p1', model: 'm1' }
  assert.equal(summarizeTranscriptRequestSchema.safeParse(valid).success, true)
  for (const bad of [{ ...valid, token: 'no' }, { ...valid, transcript: { ...transcript, id: '../../bad' } },
    { ...valid, transcript: { ...transcript, sourceUrl: 'https://chat.deepseek.com.evil.test/a' } },
    { ...valid, transcript: { ...transcript, messages: [{ id: '1', role: 'user', markdown: 'x'.repeat(4_100_000) }] } }]) {
    assert.equal(summarizeTranscriptRequestSchema.safeParse(bad).success, false)
  }
  assert.equal(exportTranscriptRequestSchema.safeParse({ transcript, target: { kind: 'directory', directory: '/tmp' },
    allowPartial: false, ignored: true }).success, false)
})

test('isolated RPC descriptors decode actual methods and forbid credential payloads', () => {
  assert.deepEqual(DSH_HANDOFF_DESCRIPTORS.map(d => d.method), ['models', 'summarize', 'exportTranscript'])
  for (const descriptor of DSH_HANDOFF_DESCRIPTORS) {
    assert.equal(descriptor.namespace, 'dshChatHandoff')
    assert.equal(descriptor.cancellation?.parameter, 'signal')
    assert.equal(descriptor.result.mode, 'strict')
  }
})

test('published Cordis and Gateway expose isolated strict summary/export and work without optional LLM', async t => {
  const require = createRequire(join(process.cwd(), 'package.json'))
  const { build } = require('esbuild')
  const { Context } = require('@deepseek-ai/cordis')
  const { default: TypertRegistry } = require('@deepseek-ai/dsh-typert-registry')
  const { default: TypertGateway } = require('@deepseek-ai/dsh-api-gateway')
  const cache = join(process.cwd(), 'node_modules', '.cache')
  await mkdir(cache, { recursive: true })
  const output = await mkdtemp(join(cache, 'handoff-server-test-'))
  const target = await mkdtemp(join(process.cwd(), '.handoff-server-fixture-'))
  t.after(async () => { await rm(output, { recursive: true, force: true }); await rm(target, { recursive: true, force: true }) })
  const artifact = join(output, 'server.mjs')
  await build({ entryPoints: ['src/handoff-server.ts'], outfile: artifact, bundle: true, packages: 'external',
    format: 'esm', platform: 'node', target: 'es2022' })
  const { DshChatHandoffController } = await import(pathToFileURL(artifact).href)
  const ctx = new Context()
  ctx.provide('remoteAccess', { decide: () => ({ allowed: true }) })
  const registry = ctx.plugin(TypertRegistry); await registry
  const gateway = ctx.plugin(TypertGateway); await gateway
  const controller = ctx.plugin(DshChatHandoffController); await controller
  t.after(async () => { await controller.dispose(); await gateway.dispose(); await registry.dispose() })
  const peer = { id: 'handoff-fixture-peer', ctx, principal: { kind: 'owner' }, interactions: 'none',
    signal: new AbortController().signal, dispose: async () => {} }
  const invoke = (method: string, args: object = {}, signal?: AbortSignal) => ctx.typertGateway.invoke({ namespace: 'dshChatHandoff', method, args, signal, peer })
  assert.deepEqual(await invoke('models'), [])
  const request = { transcript, target: { kind: 'directory', directory: target }, allowPartial: true }
  const result = await invoke('exportTranscript', { request })
  assert.equal(result.directory, target)
  assert.ok((await readFile(result.filePath, 'utf8')).includes('Only loaded messages'))
  await assert.rejects(invoke('summarize', { request: { transcript, provider: 'p', model: 'm', token: 'invalid' } }),
    (error: { code?: string }) => error.code === 'gateway/input-invalid')
  await assert.rejects(invoke('models', {}, AbortSignal.abort()),
    (error: { code?: string }) => error.code === 'gateway/cancelled')
  ctx.provide('llm', {
    listProviders: () => [{ id: 'fixture-provider', name: 'Fixture' }],
    listModels: async () => [{ provider: 'fixture-provider', id: 'fixture-model', name: 'Model' }],
    async *stream(options: { provider: string; model: string; purpose: string }) {
      assert.equal(options.provider, 'fixture-provider'); assert.equal(options.model, 'fixture-model'); assert.equal(options.purpose, 'compaction')
      yield { type: 'text-delta', index: 0, text: 'Fixture summary' }; yield { type: 'finish', reason: { kind: 'stop' } }
    },
  })
  assert.equal(await invoke('summarize', { request: { transcript, provider: 'fixture-provider', model: 'fixture-model' } }), 'Fixture summary')
  assert.equal(ctx.typert.local.get('dshChatHandoff/exportTranscript').parameters[0].codec.mode, 'strict')
  assert.equal(ctx.typert.local.get('dshDeepseekChat/loadWebsiteSession'), undefined)
})
