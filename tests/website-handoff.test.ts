import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebsiteHandoffPort } from '../src/website-handoff.js'

const frame = () => ({ url: 'https://chat.deepseek.com/a/chat/s/fixture', title: 'Fixture', branch: '', messages: [
  { id: 'u1', stable: true, role: 'user', markdown: 'Question', attachments: [] },
  { id: 'a1', stable: true, role: 'assistant', markdown: 'Answer', attachments: [] },
], top: true, bottom: true, virtual: false, scrollTop: 0, scrollHeight: 500, clientHeight: 500, busy: false })

test('delivery watcher permits intentional Harness mode while still fencing source identity', async () => {
  let mode='chat',identity='document 1',strict=0,delivery=0
  const listeners=new Set<()=>void>()
  const port=createWebsiteHandoffPort({execute:async()=>frame(),identity:(allowModeChange=false)=>{if(mode!=='chat'&&!allowModeChange)throw new Error('mode changed');return identity},lifetime:new AbortController().signal,subscribeIdentityChange(listener){listeners.add(listener);return()=>{listeners.delete(listener)}}})
  const transcript=await port.capture(new AbortController().signal)
  const stopStrict=port.watchSource(transcript,()=>{strict++}),stopDelivery=port.watchSource(transcript,()=>{delivery++},{allowModeChange:true})
  mode='harness';for(const listener of listeners)listener()
  assert.equal(strict,1);assert.equal(delivery,0)
  identity='document 2';for(const listener of listeners)listener()
  assert.equal(delivery,1);stopStrict();stopDelivery();assert.equal(listeners.size,0)
})

test('capture freezes messages and explicitly scopes DOM-only history as loaded', async () => {
  const value = frame()
  const port = createWebsiteHandoffPort({ execute: async () => value, identity: () => 'document 1', lifetime: new AbortController().signal })
  const transcript = await port.capture(new AbortController().signal)
  assert.equal(transcript.scope, 'loaded')
  assert.ok(transcript.scopeNote.length > 10)
  assert.equal(transcript.messages[1].markdown, 'Answer')
  assert.ok(Object.isFrozen(transcript.messages))
  value.messages[1].markdown = 'Changed'
  assert.equal(transcript.messages[1].markdown, 'Answer')
})

test('capture rejects a source identity changed during guest execution', async () => {
  let identity = 'first'
  const port = createWebsiteHandoffPort({ execute: async () => { identity = 'second'; return frame() }, identity: () => identity, lifetime: new AbortController().signal })
  await assert.rejects(port.capture(new AbortController().signal), /已变化|重新采集/)
})

test('guest lifetime cancellation rejects late capture results', async () => {
  const lifetime = new AbortController()
  const port = createWebsiteHandoffPort({ execute: async () => { lifetime.abort(); return frame() }, identity: () => 'same', lifetime: lifetime.signal })
  await assert.rejects(port.capture(new AbortController().signal), /已取消|会话已结束/)
})

test('large source text keeps a bounded branch fingerprint for strict RPC', async () => {
  const value=frame();value.messages[1].markdown='long source paragraph\n'.repeat(500)
  const port=createWebsiteHandoffPort({execute:async()=>value,identity:()=> 'same',lifetime:new AbortController().signal})
  const transcript=await port.capture(new AbortController().signal)
  assert.ok(transcript.branchSignature.length<=4096)
  assert.equal(transcript.messages[1].markdown.length,11000)
})

test('virtualized branch controls may leave the viewport without changing source', async () => {
  const value=frame();value.branch=JSON.stringify([['u1','1 / 2']])
  const port=createWebsiteHandoffPort({execute:async()=>value,identity:()=> 'same',lifetime:new AbortController().signal})
  const transcript=await port.capture(new AbortController().signal)
  value.messages=value.messages.slice(1);value.branch=''
  await port.validate(transcript,new AbortController().signal)
  value.messages=frame().messages;value.branch=JSON.stringify([['u1','2 / 2']])
  await assert.rejects(port.validate(transcript,new AbortController().signal),/已变化|重新采集/)
})

test('source watcher reports identity or lifetime invalidation without reading message bodies', async () => {
  let identity='first', reads=0, changed=0
  const listeners=new Set<()=>void>(),lifetime=new AbortController()
  const port=createWebsiteHandoffPort({execute:async()=>{reads++;return frame()},identity:()=>identity,lifetime:lifetime.signal,subscribeIdentityChange(listener){listeners.add(listener);return()=>{listeners.delete(listener)}}})
  const transcript=await port.capture(new AbortController().signal)
  const stop=port.watchSource(transcript,()=>{changed++})
  identity='second';for(const listener of listeners)listener()
  assert.equal(changed,1);assert.equal(reads,1)
  stop();assert.equal(listeners.size,0)
  const next=await port.capture(new AbortController().signal)
  const stopNext=port.watchSource(next,()=>{changed++})
  lifetime.abort();assert.equal(changed,2);stopNext()
})
