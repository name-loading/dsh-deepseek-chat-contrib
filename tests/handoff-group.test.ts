import test from 'node:test'
import assert from 'node:assert/strict'
import { filterTranscript, groupTranscriptTurns } from '../src/handoff-group.js'
import type { ChatMessage, ChatTranscript } from '../src/handoff-types.js'

const message = (id: string, role: 'user' | 'assistant', markdown: string): ChatMessage => ({ id, role, markdown })
const transcript: ChatTranscript = {
  id: 'filter-fixture', sourceUrl: 'https://chat.deepseek.com/a/chat/s/fixture', title: 'Fixture', capturedAt: 1,
  branchSignature: 'b', scope: 'loaded', scopeNote: '已加载范围',
  messages: [message('u1', 'user', '第一轮'), message('a1', 'assistant', '回答一'), message('u2', 'user', '第二轮'), message('a2', 'assistant', '回答二')],
}

test('groups each user message with its following assistant replies', () => {
  const turns = groupTranscriptTurns([
    message('u1', 'user', '第一个问题'),
    message('a1', 'assistant', '第一个回答'),
    message('u2', 'user', '第二个问题\n更多说明'),
    message('a2', 'assistant', '第二个回答'),
  ])
  assert.equal(turns.length, 2)
  assert.equal(turns[0].title, '第一个问题')
  assert.deepEqual(turns[0].messages.map(item => item.id), ['u1', 'a1'])
  assert.equal(turns[1].title, '第二个问题')
  assert.deepEqual(turns[1].messages.map(item => item.id), ['u2', 'a2'])
})

test('a leading assistant message keeps its own collapsible group', () => {
  const turns = groupTranscriptTurns([
    message('a0', 'assistant', '开场回答'),
    message('u1', 'user', '问题'),
    message('a1', 'assistant', '回答'),
  ])
  assert.equal(turns.length, 2)
  assert.equal(turns[0].title, '助手回复 · 开场回答')
  assert.deepEqual(turns[0].messages.map(item => item.id), ['a0'])
  assert.deepEqual(turns[1].messages.map(item => item.id), ['u1', 'a1'])
})

test('empty and very long user messages get a readable title', () => {
  const long = 'x'.repeat(120)
  const turns = groupTranscriptTurns([
    message('u0', 'user', '   '),
    message('u1', 'user', long),
  ])
  assert.equal(turns[0].title, '（用户消息）')
  assert.equal(turns[1].title, `${'x'.repeat(80)}…`)
})

test('no messages produce no groups', () => {
  assert.deepEqual(groupTranscriptTurns([]), [])
})

test('turn keys are the first message id and stay stable', () => {
  const turns = groupTranscriptTurns(transcript.messages)
  assert.deepEqual(turns.map(turn => turn.key), ['u1', 'u2'])
})

test('filterTranscript keeps selected turn pairs and drops the rest', () => {
  const filtered = filterTranscript(transcript, ['u2'])
  assert.equal(filtered.selected, 1)
  assert.equal(filtered.total, 2)
  assert.deepEqual(filtered.transcript.messages.map(item => item.id), ['u1', 'a1'])
  assert.match(filtered.transcript.scopeNote, /1\/2 轮对话/)
})

test('filterTranscript keeps every turn when nothing is deselected and can drop all', () => {
  assert.equal(filterTranscript(transcript, []).transcript, transcript)
  const empty = filterTranscript(transcript, ['u1', 'u2'])
  assert.equal(empty.selected, 0)
  assert.deepEqual(empty.transcript.messages, [])
})

test('filterTranscript keeps a leading assistant-only turn selectable', () => {
  const leading: ChatTranscript = { ...transcript, messages: [message('a0', 'assistant', '开场'), message('u1', 'user', '问题'), message('a1', 'assistant', '回答')] }
  const filtered = filterTranscript(leading, ['a0'])
  assert.deepEqual(filtered.transcript.messages.map(item => item.id), ['u1', 'a1'])
})
