import test from 'node:test'
import assert from 'node:assert/strict'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { HandoffSummarizer } from '../src/handoff-summary.js'
import type { ChatTranscript } from '../src/handoff-types.js'

const transcript: ChatTranscript = { id: 'handoff-summary-1', sourceUrl: 'https://chat.deepseek.com/a/chat/example',
  title: 'Summary', capturedAt: 1760000000000, branchSignature: 'one', scope: 'complete', scopeNote: 'Complete',
  messages: [{ id: 'm1', role: 'user', markdown: 'First request' }, { id: 'm2', role: 'assistant', markdown: 'Last answer' }] }
const provider = { id: 'chosen-provider', name: 'Chosen' }
const model = { provider: provider.id, id: 'chosen-model', name: 'Chosen Model' }
function fixture(stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>) {
  return { listProviders: () => [provider], listModels: async (id: string) => {
    assert.equal(id, provider.id); return [model]
  }, stream }
}
async function* answer(text: string): AsyncIterable<StreamChunk> {
  yield { type: 'reasoning-delta', index: 0, text: 'Hidden thoughts' }
  yield { type: 'text-delta', index: 1, text }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

test('summarizes through selected provider with compaction and canonical visible block assembly', async () => {
  const summarizer = new HandoffSummarizer(fixture(options => {
    assert.equal(options.provider, 'chosen-provider'); assert.equal(options.model, 'chosen-model')
    assert.equal(options.purpose, 'compaction'); assert.equal(options.tools, undefined)
    assert.equal(options.messages[0].role, 'user'); assert.ok(options.messages[0].id)
    assert.ok(JSON.stringify(options.messages).includes('Last answer'))
    return answer('Visible brief')
  }))
  assert.deepEqual(await summarizer.models(new AbortController().signal), [
    { provider: 'chosen-provider', model: 'chosen-model', label: 'Chosen / Chosen Model' },
  ])
  assert.equal(await summarizer.summarize({ transcript, provider: provider.id, model: model.id }, new AbortController().signal), 'Visible brief')
})

test('long single message and recursive reduction keep every request bounded and all source characters represented', async () => {
  const body = 'START|' + 'α'.repeat(11_000) + '|MIDDLE|' + 'β'.repeat(11_000) + '|END'
  const seen: string[] = []
  let calls = 0
  const summarizer = new HandoffSummarizer(fixture(options => {
    const visible = options.messages.flatMap(message => message.content).map(block => block.type === 'text' ? block.text : '').join('')
    assert.ok(visible.length + (options.system?.length ?? 0) <= 2000)
    seen.push(visible); calls++
    return answer(calls <= 18 ? `Part-${calls}: ` + 'z'.repeat(350) : 'Final brief')
  }), { maxRequestChars: 2000, maxOutputChars: 600 })
  const result = await summarizer.summarize({ transcript: { ...transcript, messages: [{ id: 'huge', role: 'user', markdown: body }] },
    provider: provider.id, model: model.id }, new AbortController().signal)
  assert.ok(result.length > 0); assert.ok(calls > 18)
  assert.ok(seen.some(text => text.includes('START|'))); assert.ok(seen.some(text => text.includes('|MIDDLE|')))
  assert.ok(seen.some(text => text.includes('|END')))
  assert.equal(seen.reduce((count, text) => count + [...text].filter(char => char === 'α').length, 0), 11_000)
  assert.equal(seen.reduce((count, text) => count + [...text].filter(char => char === 'β').length, 0), 11_000)
})

test('missing service and unknown selected model fail before any model call and do not fall back', async () => {
  await assert.rejects(new HandoffSummarizer(undefined).summarize({ transcript, provider: provider.id, model: model.id },
    new AbortController().signal), /configured|unavailable|模型/i)
  const summarizer = new HandoffSummarizer(fixture(() => { assert.fail('must not call a substitute model') }))
  await assert.rejects(summarizer.summarize({ transcript, provider: provider.id, model: 'missing' }, new AbortController().signal), /selected|available|模型/i)
})

test('selected provider remains usable when an unrelated configured provider is unavailable', async () => {
  const summarizer = new HandoffSummarizer({
    ...fixture(() => answer('Selected provider brief')),
    listProviders: () => [provider, { id: 'unrelated', name: 'Unavailable' }],
    listModels: async id => {
      if (id === 'unrelated') throw new Error('unrelated provider is offline')
      return [model]
    },
  })
  assert.equal(await summarizer.summarize({ transcript, provider: provider.id, model: model.id }, new AbortController().signal), 'Selected provider brief')
  assert.deepEqual(await summarizer.models(new AbortController().signal), [
    { provider: 'chosen-provider', model: 'chosen-model', label: 'Chosen / Chosen Model' },
  ])
})

test('model discovery without optional LLM returns no models and never blocks the website source', async () => {
  assert.deepEqual(await new HandoffSummarizer(undefined).models(new AbortController().signal), [])
})

test('cancelling a partitioned summary stops before requesting any subsequent segment', async () => {
  const controller = new AbortController()
  let calls = 0
  let observed!: AbortSignal
  let started!: () => void
  const active = new Promise<void>(resolve => { started = resolve })
  const summarizer = new HandoffSummarizer(fixture(async function* (options) {
    calls++; observed = options.signal!; started()
    await new Promise<void>(resolve => options.signal!.addEventListener('abort', () => resolve(), { once: true }))
    yield { type: 'finish', reason: { kind: 'stop' } }
  }), { maxRequestChars: 2000, maxOutputChars: 600 })
  const pending = summarizer.summarize({ transcript: { ...transcript, messages: [{ id: 'huge', role: 'user', markdown: 'x'.repeat(12_000) }] },
    provider: provider.id, model: model.id }, controller.signal)
  await active; controller.abort()
  await assert.rejects(pending)
  assert.equal(observed.aborted, true)
  assert.equal(calls, 1)
})

test('terminal truncation or absent finish never returns a misleading completed brief', async () => {
  for (const reason of ['max-tokens', 'none'] as const) {
    const summarizer = new HandoffSummarizer(fixture(async function* () {
      yield { type: 'text-delta', index: 0, text: 'Incomplete' }
      if (reason !== 'none') yield { type: 'finish', reason: { kind: reason } }
    }))
    await assert.rejects(summarizer.summarize({ transcript, provider: provider.id, model: model.id }, new AbortController().signal), /complete|truncat|finish|完成/i)
  }
})

test('streamed provider failure keeps its stable code and status for retry guidance', async () => {
  const summarizer = new HandoffSummarizer(fixture(async function* () {
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', status: 401, message: 'invalid api key for this route' } } }
  }))
  await assert.rejects(summarizer.summarize({ transcript, provider: provider.id, model: model.id }, new AbortController().signal), error => {
    assert.match(error.message, /AUTH/); assert.match(error.message, /401/); assert.match(error.message, /invalid api key/)
    return true
  })
})

test('a thrown provider error exposes only its stable code, never the raw provider text', async () => {
  const summarizer = new HandoffSummarizer(fixture(async function* () { throw Object.assign(new Error('secret-provider-diagnostic'), { code: 'RATE_LIMIT', status: 429 }) }))
  await assert.rejects(summarizer.summarize({ transcript, provider: provider.id, model: model.id }, new AbortController().signal), error => {
    assert.match(error.message, /RATE_LIMIT/); assert.match(error.message, /429/); assert.doesNotMatch(error.message, /secret-provider-diagnostic/)
    return true
  })
})

test('cancellation and deadline stop a hanging stream promptly and propagate its signal', async () => {
  for (const timeout of [false, true]) {
    let observed: AbortSignal | undefined
    const summarizer = new HandoffSummarizer(fixture(async function* (options) {
      observed = options.signal
      await new Promise<void>(resolve => options.signal!.addEventListener('abort', () => resolve(), { once: true }))
      yield { type: 'finish', reason: { kind: 'stop' } }
    }), { deadlineMs: timeout ? 20 : 1000 })
    const controller = new AbortController()
    const pending = summarizer.summarize({ transcript, provider: provider.id, model: model.id }, controller.signal)
    if (!timeout) setTimeout(() => controller.abort(), 10)
    await assert.rejects(pending)
    assert.ok(observed?.aborted)
  }
})

test('provider failures and excessively large model output produce fixed actionable errors without provider details', async () => {
  const summarizer = new HandoffSummarizer(fixture(async function* () { throw new Error('secret-provider-diagnostic') }))
  await assert.rejects(summarizer.summarize({ transcript, provider: provider.id, model: model.id }, new AbortController().signal), error => {
    assert.ok(error instanceof Error); assert.ok(!error.message.includes('secret-provider-diagnostic')); return true
  })
  const oversize = new HandoffSummarizer(fixture(() => answer('too long '.repeat(1000))), { maxOutputChars: 100 })
  await assert.rejects(oversize.summarize({ transcript, provider: provider.id, model: model.id }, new AbortController().signal), /large|long|limit|长度/i)
})

test('auxiliary summary selects the least reasoning effort and a larger completion budget', async () => {
  let seen: GenerateOptions | undefined
  const summarizer = new HandoffSummarizer({
    ...fixture(options => { seen = options; return answer('Effort-aware brief') }),
    resolveModelInfo: async (route, exact) => {
      assert.equal(route, provider.id); assert.equal(exact, model.id)
      return { ...model, reasoning: { efforts: [{ id: 'off' as never, name: 'Off' }, { id: 'high' as never, name: 'High' }] } }
    },
  })
  assert.equal(await summarizer.summarize({ transcript, provider: provider.id, model: model.id }, new AbortController().signal), 'Effort-aware brief')
  assert.equal(seen?.reasoningEffort, 'off')
  assert.equal(seen?.maxTokens, 4000)
})

test('an unavailable reasoning lookup does not block the summary', async () => {
  let seen: GenerateOptions | undefined
  const summarizer = new HandoffSummarizer({
    ...fixture(options => { seen = options; return answer('Fallback brief') }),
    resolveModelInfo: async () => { throw new Error('metadata unavailable') },
  })
  assert.equal(await summarizer.summarize({ transcript, provider: provider.id, model: model.id }, new AbortController().signal), 'Fallback brief')
  assert.equal(seen?.reasoningEffort, undefined)
  assert.equal(seen?.maxTokens, 4000)
})
