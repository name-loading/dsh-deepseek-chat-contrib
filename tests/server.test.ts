import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require=createRequire(path.join(process.cwd(),'package.json'))
const {build}=require('esbuild')
const {Context}=require('@deepseek-ai/cordis')
const {default:Registry}=require('@deepseek-ai/dsh-typert-registry')
const {default:Gateway}=require('@deepseek-ai/dsh-api-gateway')
const metadata={version:'0.2.0-rc.2',locale:'zh-CN',timezoneOffsetSeconds:28800}
const session={token:'fictional-website-token',userId:'fictional-user',deviceId:'00000000-0000-4000-8000-000000000001'}

test('published Host gateway isolates website records by trusted profile and withdraws strict methods',async t=>{
  const cache=path.join(process.cwd(),'node_modules','.cache');await mkdir(cache,{recursive:true})
  const output=await mkdtemp(path.join(cache,'chat-service-'))
  t.after(()=>rm(output,{recursive:true,force:true}))
  const artifact=path.join(output,'server.mjs')
  await build({absWorkingDir:process.cwd(),entryPoints:['src/server.ts'],outfile:artifact,bundle:true,packages:'external',format:'esm',platform:'node',target:'es2022'})
  const {DshChatController}=await import(pathToFileURL(artifact).href)
  const records=new Map<string,{kind:string;payload:any}>([['unrelated/default',{kind:'grant',payload:{fictional:true}}]])
  const calls:string[]=[]
  const credentials={
    readRecord:async(key:string)=>{calls.push(key);return records.get(key)},
    modifyRecord:async(key:string,mutate:(value:unknown)=>Promise<any>)=>{calls.push(key);const value=await mutate(records.get(key));if(value!==undefined)records.set(key,value);return records.get(key)},
    deleteRecord:async(key:string)=>{calls.push(key);records.delete(key)},
  }
  async function host(dir:string|null){
    const ctx=new Context();const peer={id:'fictional-peer',ctx,principal:{kind:'owner'},interactions:'none',signal:new AbortController().signal,dispose:async()=>{}};if(dir)ctx.provide('profileContext',{dir})
    ctx.provide('credentials',credentials)
    ctx.provide('remoteAccess',{decide:()=>({allowed:true})})
    const registry=ctx.plugin(Registry);await registry
    const gateway=ctx.plugin(Gateway);await gateway
    const plugin=ctx.plugin(DshChatController);await plugin
    t.after(async()=>{await plugin.dispose();await gateway.dispose();await registry.dispose()})
    const invoke=(method:string,args:object,signal?:AbortSignal)=>ctx.typertGateway.invoke({namespace:'dshDeepseekChat',method,args,signal,peer})
    return{ctx,plugin,invoke,peer}
  }
  const dirA=path.join(output,'profile-a');const a=await host(dirA)
  const state=await a.invoke('authorization',{metadata})
  const digest=createHash('sha256').update(path.resolve(dirA),'utf8').digest('hex')
  assert.equal(state.status,'authorized');assert.equal(state.accountId,'chat-profile:'+digest)
  assert.equal(a.ctx.typert.local.get('dshDeepseekChat/authorization').parameters[0].codec.mode,'strict')
  const args={metadata,epoch:state.epoch}
  assert.equal(await a.invoke('saveWebsiteSession',{...args,session}),true)
  assert.deepEqual(await a.invoke('loadWebsiteSession',args),session)
  const key='dsh-deepseek-chat/website-'+digest
  assert.equal(records.get(key)?.payload.version,2)
  assert.equal(records.get(key)?.payload.websiteAccountId,'fictional-user')
  a.ctx.emit('deepseek-account/signed-out')
  assert.equal((await a.invoke('authorization',{metadata})).epoch,state.epoch)
  assert.deepEqual(await a.invoke('loadWebsiteSession',args),session)
  const b=await host(path.join(output,'profile-b'));const stateB=await b.invoke('authorization',{metadata})
  assert.notEqual(stateB.accountId,state.accountId)
  assert.equal(await b.invoke('loadWebsiteSession',{metadata,epoch:stateB.epoch}),null)
  const before=calls.length
  assert.equal(await a.invoke('saveWebsiteSession',{...args,epoch:'stale',session}),false)
  assert.equal(calls.length,before)
  await assert.rejects(a.invoke('saveWebsiteSession',{...args,session:{...session,cookie:'fictional'}}),(error:any)=>error.code==='gateway/input-invalid')
  await assert.rejects(a.invoke('authorization',{metadata:{...metadata,token:'fictional'}}),(error:any)=>error.code==='gateway/input-invalid')
  await assert.rejects(a.invoke('authorization',{metadata},AbortSignal.abort()),(error:any)=>error.code==='gateway/cancelled')
  assert.equal(await a.invoke('clearWebsiteSession',args),true)
  assert.equal(await a.invoke('loadWebsiteSession',args),null)
  assert.equal(records.get(key)?.payload.session,null)
  assert.deepEqual(records.get('unrelated/default'),{kind:'grant',payload:{fictional:true}})
  assert(calls.every(key=>key.startsWith('dsh-deepseek-chat/website-')))
  const volatile=await host(null);const transient=await volatile.invoke('authorization',{metadata})
  const count=calls.length
  assert.equal(await volatile.invoke('saveWebsiteSession',{metadata,epoch:transient.epoch,session}),false)
  assert.equal(calls.length,count)
  const stream=await a.ctx.typertGateway.stream({peer:a.peer,namespace:'dshDeepseekChat',method:'watchAuthorization',args:{metadata},signal:new AbortController().signal})
  const iterator=stream[Symbol.asyncIterator]();assert.equal((await iterator.next()).value.status,'authorized')
  const waiting=iterator.next();await a.plugin.dispose();assert.equal((await waiting).done,true)
  await assert.rejects(a.invoke('authorization',{metadata}),(error:any)=>error.code==='gateway/definition-unavailable')
})
