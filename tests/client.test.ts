import test from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/client.js'
import type { DshChatUIBridge } from '../src/ui.js'
import type { AuthorizationState, WebsiteSession } from '../src/protocol.js'
import { CHAT_PANEL } from '../src/core/mode.js'

const authorized = (id = 'A', epoch = 'grant-a'): AuthorizationState => ({ status: 'authorized', accountId: id, epoch, error: null })
const signedOut = (): AuthorizationState => ({ status: 'unauthorized', accountId: null, epoch: 'closed', error: null })
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }
type SessionResult<T> = { ok: true; value: T } | { ok: false; error: { code: string } }
const fictionalSession: WebsiteSession = {
  token: 'fictional-website-token', userId: 'fictional-website-user',
  deviceId: '00000000-0000-4000-8000-000000000001',
}
const readyNavigation = { authenticated: true, status: 'ready' as const, conversations: [], selectedHref: null, canCreate: true, error: null }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

/** Cordis nested-effect and declared-Slot fixtures; no native guest or webpage runs. */
function harness(originalPanel: string | null = 'plugins', failMount = false, saved?: {language:string}) {
  type Dispose = () => void | Promise<void>
  const rootEffects: Dispose[] = []
  let collector = rootEffects
  const setup: Promise<unknown>[] = []
  const order: string[] = []
  const registrations = new Map<string, { inject: () => { bridge: DshChatUIBridge } }>()
  const panelListeners = new Set<() => void>()
  let panel = originalPanel
  const requests: ReturnType<typeof deferred<{ ok: true; value: AuthorizationState }>>[] = []
  const sessionCalls: { method: 'load' | 'save' | 'clear'; epoch: string; signal: AbortSignal; session?: WebsiteSession }[] = []
  const sessionReplies: {
    load: (signal: AbortSignal) => Promise<SessionResult<WebsiteSession | null>>
    save: (signal: AbortSignal) => Promise<SessionResult<boolean>>
    clear: (signal: AbortSignal) => Promise<SessionResult<boolean>>
  } = {
    load: async () => ({ ok: true, value: null }),
    save: async () => ({ ok: true, value: true }),
    clear: async () => ({ ok: true, value: true }),
  }
  type Item = { value: AuthorizationState; signal: AbortSignal; accept: () => void }
  const queue: Item[] = []
  let waiting: ((result: IteratorResult<Item>) => void) | undefined
  let ended = false
  const stream = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<Item>> {
          if (queue.length) return Promise.resolve({ done: false, value: queue.shift()! })
          if (ended) return Promise.resolve({ done: true, value: undefined })
          return new Promise(resolve => { waiting = resolve })
        },
      }
    },
    async dispose() {
      ended = true
      waiting?.({ done: true, value: undefined }); waiting = undefined
      order.push('stream:dispose')
    },
  }
  const effect = (callback: () => unknown): Dispose => {
    const parent = collector
    const children: Dispose[] = []
    collector = children
    let result: unknown
    try { result = callback() } finally { collector = parent }
    const collect = (value: unknown) => {
      if (typeof value === 'function') children.push(value as Dispose)
      else if (value && typeof value === 'object' && Symbol.iterator in value) {
        children.push(...value as Iterable<Dispose>)
      }
    }
    if (result && typeof result === 'object' && 'then' in result) {
      const task = Promise.resolve(result).then(collect)
      setup.push(task)
      void task.catch(() => {}) // Cordis also observes failed effect setup before callers retry.
    }
    else collect(result)
    let disposed = false
    const dispose = async () => {
      if (disposed) return
      disposed = true
      for (const cleanup of [...children].reverse()) await cleanup()
    }
    parent.push(dispose)
    return Object.assign(dispose, {
      then: (fulfilled: (cleanup: Dispose) => unknown, rejected: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(() => fulfilled(() => dispose()), rejected),
    })
  }
  const prefListeners=new Set<()=>void>();const writes: [string,string][]=[]
  const form={getSnapshot:()=>({status:'ready',value:saved}),subscribe:(fn:()=>void)=>{prefListeners.add(fn);return()=>prefListeners.delete(fn)},set:async(key:string,value:string)=>{writes.push([key,value]);saved={...saved!,[key]:value};for(const fn of prefListeners)fn();return true}}
  const ctx = {
    configForms:{get:(ns:string)=>{assert.equal(ns,'deepseek-chat');return form}},
    effect,
    inject: (dependencies: string[], callback: (ctx: unknown) => unknown) => {
      assert.deepEqual(dependencies, dependencies[0]==='configForms' ? ['configForms'] : ['remote', 'remote.dshDeepseekChat'])
      if(dependencies[0]==='configForms' && !saved) return {dispose:async()=>{},then:(fulfilled:()=>unknown)=>Promise.resolve().then(fulfilled)}
      const dispose = effect(() => callback(ctx))
      return { dispose, then: (fulfilled: () => unknown) => Promise.resolve().then(fulfilled) }
    },
    slots: {
      entries: () => [],
      subscribe: () => () => {},
      inject: (_name: string, callback: () => unknown) => effect(callback),
      register: (options: { name: string; key?: string; id?: string; inject: () => { bridge: DshChatUIBridge } }) => {
        const key = `${options.name}:${options.key ?? options.id ?? ''}`
        registrations.set(key, options)
        return effect(() => () => { registrations.delete(key); order.push(`unregister:${key}`) })
      },
    },
    layout: {
      panelInfo: {
        getSnapshot: () => ({ activePanelId: panel }),
        subscribe: (listener: () => void) => { panelListeners.add(listener); return () => { panelListeners.delete(listener) } },
      },
      selectPanel: (next: string | null) => { panel = next; order.push(`panel:${next}`); for (const listener of panelListeners) listener() },
      toggleSidebar: () => {},
    },
    remote: {
      $mount: async () => {
        order.push('remote:mount')
        if (failMount) { failMount = false; throw new Error('fixture mount failure') }
        return () => { order.push('remote:unmount') }
      },
      $stream: () => stream,
      dshDeepseekChat: {
        authorization: () => { const value = deferred<{ ok: true; value: AuthorizationState }>(); requests.push(value); return value.promise },
        loadWebsiteSession: (metadata: object, epoch: string, signal: AbortSignal) => {
          assert.deepEqual(metadata, { version: '0.2.0-rc.2', locale: globalThis.navigator?.language ?? 'zh-CN', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 })
          sessionCalls.push({ method: 'load', epoch, signal }); order.push('session:load')
          return sessionReplies.load(signal)
        },
        saveWebsiteSession: (_metadata: object, epoch: string, session: WebsiteSession, signal: AbortSignal) => {
          sessionCalls.push({ method: 'save', epoch, session, signal }); order.push('session:save')
          return sessionReplies.save(signal)
        },
        clearWebsiteSession: (_metadata: object, epoch: string, signal: AbortSignal) => {
          sessionCalls.push({ method: 'clear', epoch, signal }); order.push('session:clear')
          return sessionReplies.clear(signal)
        },
      },
    },
  }
  const product = globalThis as typeof globalThis & { dshDesktop?: unknown }
  const previousDesktop = product.dshDesktop
  const previousAdd = globalThis.addEventListener
  const previousRemove = globalThis.removeEventListener
  product.dshDesktop = { protocolVersion: 1, browser: { acquire: async () => ({ lease: 'unused', partition: 'unused' }), release: async () => {}, onOpenRequested: () => () => {} } }
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  apply(ctx as unknown as Context)
  const bridge = registrations.get(`main:${CHAT_PANEL}`)!.inject().bridge
  let cleaned = false
  return {
    bridge, order, requests, writes, sessionCalls, sessionReplies, panel: () => panel, registrations: () => [...registrations.keys()],
    async ready() { await flush(); await Promise.all(setup); await flush() },
    emit(value: AuthorizationState, aborted = false) {
      const controller = new AbortController()
      if (aborted) controller.abort()
      const item = { value, signal: controller.signal, accept: () => { order.push('stream:accept') } }
      if (waiting) { const consume = waiting; waiting = undefined; consume({ done: false, value: item }) }
      else queue.push(item)
    },
    navigate: (next: string | null) => ctx.layout.selectPanel(next),
    async dispose() {
      if (cleaned) return
      cleaned = true
      try { for (const cleanup of [...rootEffects].reverse()) await cleanup() }
      finally {
        if (previousDesktop === undefined) delete product.dshDesktop
        else product.dshDesktop = previousDesktop
        globalThis.addEventListener = previousAdd
        globalThis.removeEventListener = previousRemove
      }
    },
  }
}


async function enterChat(h: ReturnType<typeof harness>) {
  await h.ready(); h.requests[0].resolve({ ok: true, value: authorized() }); await flush()
  h.bridge.selectMode('chat'); await flush()
  const generation=h.bridge.getSnapshot().authorizationGeneration
  h.bridge.reportWebsiteNavigation(generation,readyNavigation); return generation
}
test('CHAT opens before website login and restores the original Harness panel',async()=>{
  const h=harness(); try { await h.ready(); h.bridge.selectMode('chat')
    assert.equal(h.panel(),CHAT_PANEL); assert(h.registrations().includes('sidebar.workspaces:'))
    h.bridge.selectMode('harness'); assert.equal(h.panel(),'plugins'); assert(!h.registrations().includes('sidebar.workspaces:'))
  } finally {await h.dispose()}
})
test('Host generation changes invalidate the website projection without leaving CHAT',async()=>{
  const h=harness(); try {const generation=await enterChat(h); h.emit(authorized('B','grant-b'));await flush()
    assert.equal(h.bridge.getSnapshot().mode,'chat');assert.notEqual(h.bridge.getSnapshot().authorizationGeneration,generation)
    assert.equal(h.bridge.getSnapshot().accountStorageKey,'dsh-deepseek-chat:website:B')
    h.bridge.reportWebsiteNavigation(generation,readyNavigation);assert.equal(h.bridge.getSnapshot().websiteAuthenticationStatus,'loading')
  }finally{await h.dispose()}
})
test('transport failures preserve CHAT and can be retried',async()=>{
  const h=harness();try{await enterChat(h);h.bridge.refreshAuthorization();await flush()
    h.requests[1].reject(new Error('fictional offline'));await flush();assert.equal(h.bridge.getSnapshot().mode,'chat');assert(h.bridge.getSnapshot().error)
    h.bridge.refreshAuthorization();await flush();h.requests[2].resolve({ok:true,value:authorized()});await flush();assert.equal(h.bridge.getSnapshot().error,null)
  }finally{await h.dispose()}
})
test('website authorization values never enter published UI state',async()=>{
  const h=harness();try{const generation=await enterChat(h);assert.equal(await h.bridge.saveWebsiteSession(generation,fictionalSession),true)
    assert.equal(h.bridge.getSnapshot().websiteSessionStatus,'saved');h.sessionReplies.load=async()=>({ok:true,value:fictionalSession})
    assert.deepEqual(await h.bridge.loadWebsiteSession(generation),fictionalSession)
    for(const value of Object.values(fictionalSession))assert(!JSON.stringify(h.bridge.getSnapshot()).includes(value))
    h.sessionReplies.save=async()=>{throw new Error(fictionalSession.token)};assert.equal(await h.bridge.saveWebsiteSession(generation,fictionalSession),false)
    assert.equal(h.bridge.getSnapshot().websiteSessionStatus,'error');assert(!JSON.stringify(h.bridge.getSnapshot()).includes(fictionalSession.token))
  }finally{await h.dispose()}
})
test('website logout clears saved login first and keeps mode controls usable',async()=>{
  const h=harness();try{const generation=await enterChat(h);const commands:string[]=[]
    h.bridge.bindWebsiteNavigation(generation,async command=>{commands.push(command.type);h.order.push('website:'+command.type)})
    h.bridge.logoutWebsite();await flush();await flush();assert.deepEqual(commands,['logout'])
    assert(h.order.indexOf('session:clear')<h.order.indexOf('website:logout'))
    h.bridge.reportWebsiteNavigation(generation,{status:'sign-in',conversations:[],selectedHref:null,canCreate:false,error:null})
    assert.equal(h.bridge.getSnapshot().mode,'chat');assert.equal(h.bridge.getSnapshot().modeEnabled,true)
    assert.equal(h.bridge.getSnapshot().websiteAuthenticationStatus,'signed-out');assert.equal(await h.bridge.loadWebsiteSession(generation),null)
  }finally{await h.dispose()}
})
for(const failure of ['refused','rejected']as const){test('website logout preserves the login when clear is '+failure,async()=>{
  const h=harness();try{const generation=await enterChat(h);const commands:string[]=[]
    h.bridge.bindWebsiteNavigation(generation,async command=>{commands.push(command.type)})
    h.sessionReplies.clear=failure==='refused'?async()=>({ok:true,value:false}):async()=>{throw new Error('fictional')}
    h.bridge.logoutWebsite();await flush();await flush();assert.deepEqual(commands,[])
    assert.equal(h.bridge.getSnapshot().websiteAuthenticationStatus,'error');assert.equal(await h.bridge.loadWebsiteSession(generation),null)
  }finally{await h.dispose()}
})}
test('late website writes are ignored after a Host generation change',async()=>{
  const h=harness();try{const generation=await enterChat(h);const pending=deferred<SessionResult<boolean>>()
    h.sessionReplies.save=()=>pending.promise;const writing=h.bridge.saveWebsiteSession(generation,fictionalSession);await flush()
    h.emit(authorized('B','grant-b'));await flush();pending.resolve({ok:true,value:true})
    assert.equal(await writing,false);assert.equal(h.bridge.getSnapshot().websiteSessionStatus,'idle')
  }finally{await h.dispose()}
})
test('unloading restores the original panel before removing CHAT main slot',async()=>{
  const h=harness();try{await enterChat(h);await h.dispose();assert.equal(h.panel(),'plugins')
    assert(h.order.lastIndexOf('panel:plugins')<h.order.indexOf('unregister:main:'+CHAT_PANEL))
    assert(h.order.includes('stream:dispose'));assert(h.order.includes('remote:unmount'))
  }finally{await h.dispose()}
})
