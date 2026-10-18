import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DesktopBrowserBridge } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import { CHAT_PANEL, ModeController } from './core/mode.js'
import { HOST_ENTRY_ID, DEFAULT_WEBSITE_LANGUAGE } from './identity.js'
import { authorizationSchema, DSH_CHAT_REMOTE_CONTRIBUTION } from './protocol.js'
import type { AuthorizationState, DshChatClientMetadata, WebsiteSession } from './protocol.js'
import { acquireChatStyles } from './styles.js'
import { guardHarnessSearchReplay, DshChatBrandName, DshChatChatNavigation, DshChatChatPanel, DshChatLeadingControls, DshChatChatSettings } from './ui.js'
import type { DshChatUIBridge, DshChatViewState, DshChatViewportRect } from './ui.js'
import { DshChatWebSurface } from './web-surface.js'
import { emptyNavigation, parseWebsiteNavigation, type WebsiteCommand } from './website-navigation.js'
import { createSidebarBinding } from './sidebar-adapter.js'
import { createHandoffController } from './handoff-client.js'
import { DshChatHandoffDialog, DshChatHandoffInsertion } from './handoff-ui.js'
import type { WebsiteHandoffPort } from './handoff-types.js'

export const name = 'dsh-deepseek-chat'
export const inject = ['slots', 'layout', 'remote']
const AUTHORIZATION_TIMEOUT_MS = 35_000

function desktopBrowser(): DesktopBrowserBridge | undefined {
  const desktop = (globalThis as typeof globalThis & {
    dshDesktop?: { protocolVersion?: number; browser?: DesktopBrowserBridge }
  }).dshDesktop
  if (desktop?.protocolVersion !== 1) return undefined
  const browser = desktop.browser
  return browser && typeof browser.acquire === 'function' && typeof browser.release === 'function'
    && typeof browser.onOpenRequested === 'function' ? browser : undefined
}

export function apply(ctx: Context): void {
  const nativeBrowser = desktopBrowser()
  const lifetime = new AbortController()
  const listeners = new Set<() => void>()
  let disposed = false
  let remoteContext: Context | null = null
  let connecting: Promise<void> | null = null
  let refreshing: Promise<void> | null = null
  let authorizationGeneration = 0
  let websiteReloadRevision = 0
  let websiteNavigationRefreshing = false
  let websiteNavigationRefreshError: string | null = null
  let websiteNavigationRefreshRequest = 0
  let webLoading = false
  let webError: string | null = null
  let connectionError: string | null = null
  let settingsOpen = false
  let settingsReadRequested=false
  let preferenceError: string | null = null
  let preferences: {language:string} | null = null
  let preferenceForm: import('@deepseek-ai/dsh-client-ui-settings/client').ConfigForm<{language:string}> | null = null
  let preferencesGeneration = -1
  let restoringPreferences = false
  let restorationSeen = false
  let websiteSignedOut = false
  let restorationBlocked = false
  let websiteAuthenticationStatus: DshChatViewState['websiteAuthenticationStatus'] = 'loading'
  let websiteAuthenticationRevision = 0
  let websiteSignInRequested = false
  let logoutFailed = false
  let logoutVaultCleared = false
  let logoutRequested = false
  let forgettingWebsiteSession = false
  let logoutTimer: ReturnType<typeof setTimeout> | undefined
  let websiteHadSession = false
  let websiteSessionStatus: DshChatViewState['websiteSessionStatus'] = 'idle'
  let websiteSessionError: string | null = null
  let pendingSessionSave: Promise<boolean> | null = null
  let pendingSessionSaveRevision=-1
  let pendingSessionClear: Promise<boolean> | null = null
  const pendingPreferences = new Map<string,string>()
  let viewport: DshChatViewportRect | null = null
  let brandAnchor: DshChatViewportRect | null = null
  let brandAnchorOwner: HTMLElement | null = null
  let sidebarAdapted: boolean | null = null
  let websiteNavigation = emptyNavigation()
  let showWebsiteNavigation = false
  let conversationActionPending = false
  let navigationHandler: ((command: WebsiteCommand) => Promise<void>) | null = null
  let bridge: DshChatUIBridge
  let websiteHandoff: WebsiteHandoffPort | null = null
  const handoff = createHandoffController(ctx, () => websiteHandoff, () => bridge.selectMode('harness'))
  let cached: DshChatViewState
  let sidebar: ReturnType<typeof createSidebarBinding> | undefined
  const mode = new ModeController({
    readPanel: () => ctx.layout.panelInfo.getSnapshot().activePanelId,
    selectPanel: panel => { ctx.layout.selectPanel(panel as MainPanelId | null) },
    mountChatNavigation: () => {
      const navigation = ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({ name: 'sidebar.workspaces', priority: -100, inject: () => ({ bridge }) }, DshChatChatNavigation))
      const leading = ctx.slots.inject('shell.leading', () => ctx.slots.register({name:'shell.leading',priority:-100,inject:()=>({bridge})}, DshChatLeadingControls))
      return () => { leading(); navigation() }
    },
    cancelAccount: () => { authorizationGeneration++; resetNavigationRefresh(); webLoading = false; webError = null; websiteNavigation = emptyNavigation(); navigationHandler = null; publish() },
  }, Boolean(nativeBrowser))
  function availability(): string {
    if (!nativeBrowser) return '网页嵌入需要 DSH 桌面版的官方浏览器能力。'
    if (websiteAuthenticationStatus === 'signing-out') return '正在退出 DeepSeek 官网。'
    if (websiteSignedOut) return 'CHAT 尚未登录。可进入 CHAT 或 CHAT设置完成官网登录。'
    return 'CHAT 使用独立的 DeepSeek 官网登录；随时可以切换 HARNESS。'
  }
  function publish(): void {
    if (disposed) return
    const state = mode.getSnapshot()
    cached = {
      mode: state.mode, modeEnabled: mode.canEnter(), authorizationStatus: state.authorization.status,
      availabilityMessage: availability(), accountLabel: websiteNavigation.accountName ?? null,
      error: state.error ?? connectionError ?? (state.authorization.error === 'profile-context-unavailable'
        ? '当前 DSH 未提供可信配置上下文，网页登录可用，但不能保存登录记忆。'
        : state.authorization.error ? 'CHAT 登录保存服务暂时不可用，请重试连接。' : null),
      desktopAvailable: Boolean(nativeBrowser), webLoading, webError, settingsOpen, preferenceError, viewport, brandAnchor, sidebarAdapted,
      websiteSessionStatus, websiteSessionError, websiteAuthenticationStatus, websiteAuthenticationRevision,
      accountStorageKey: state.authorization.status === 'authorized' && state.authorization.accountId
        ? `dsh-deepseek-chat:website:${state.authorization.accountId}` : null,
      authorizationGeneration, websiteReloadRevision, websiteNavigationRefreshing, websiteNavigationRefreshError, websiteNavigation, showWebsiteNavigation,
    }
    sidebar?.sync()
    for (const listener of listeners) listener()
  }
  function resetNavigationRefresh(): void {
    websiteNavigationRefreshRequest++
    websiteNavigationRefreshing=false
    websiteNavigationRefreshError=null
  }
  function acceptAuthorization(value: AuthorizationState): void {
    const next = authorizationSchema.parse(value)
    const previous = mode.getSnapshot().authorization
    if (next.accountId !== previous.accountId || next.epoch !== previous.epoch) {
      resetNavigationRefresh()
      authorizationGeneration++; websiteNavigation = emptyNavigation(); navigationHandler = null; showWebsiteNavigation = false;websiteSignedOut=false;restorationBlocked=false;logoutRequested=false;websiteHadSession=false;preferencesGeneration=-1
      websiteSessionStatus='idle';websiteSessionError=null;websiteAuthenticationStatus='loading';websiteAuthenticationRevision++;websiteSignInRequested=false;logoutFailed=false;logoutVaultCleared=false
      forgettingWebsiteSession=false
      clearTimeout(logoutTimer);logoutTimer=undefined
    }
    connectionError = null
    mode.updateAuthorization(next)
    publish()
  }
  const metadata: DshChatClientMetadata = {
    version: '0.2.0-rc.2', locale: globalThis.navigator?.language ?? 'zh-CN',
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
  function authorizationFailed(message: string): void {
    if (disposed) return
    connectionError = message
    const previous = mode.getSnapshot().authorization
    // A transport failure cannot revoke an already confirmed account or imply sign-out.
    if (previous.status === 'pending') mode.updateAuthorization({ ...previous, status: 'unavailable' })
    publish()
  }
  async function connectRemote(): Promise<void> {
    if (remoteContext || disposed) return
    if (!connecting) {
      connecting = Promise.resolve(ctx.effect(async () => {
        const unmount = await ctx.remote.$mount(DSH_CHAT_REMOTE_CONTRIBUTION)
        if (disposed) { await unmount(); return () => {} }
        // $mount publishes a separate Cordis service. Inject it only after
        // mounting, and call its methods from this dependency-aware Context.
        const consumer = ctx.inject(['remote', 'remote.dshDeepseekChat'], remoteCtx => {
          remoteCtx.effect(() => {
            remoteContext = remoteCtx
            const stream = remoteCtx.remote.$stream<AuthorizationState>({
              name: 'dsh-deepseek-chat.authorization', open: signal => remoteCtx.remote.dshDeepseekChat.watchAuthorization(metadata, signal),
              ended: () => new Error('CHAT session service stream ended'),
              carrierFailed: () => { authorizationFailed('CHAT 登录保存服务连接暂时中断，请重试连接。') },
            })
            void (async () => {
              try {
                for await (const item of stream) {
                  if (disposed || remoteContext !== remoteCtx) break
                  if (item.signal.aborted) continue
                  acceptAuthorization(item.value); item.accept()
                }
              } catch { if (remoteContext === remoteCtx) authorizationFailed('CHAT 登录保存服务状态通知不可用，请重试连接。') }
            })()
            return () => {
              if (remoteContext === remoteCtx) remoteContext = null
              return stream.dispose()
            }
          }, 'dsh-deepseek-chat website session observation')
        })
        try { await consumer }
        catch (error) { await consumer.dispose(); await unmount(); throw error }
        return async () => { await consumer.dispose(); await unmount() }
      }, 'dsh-deepseek-chat website session remote')).then(() => {}).finally(() => { connecting = null })
    }
    await connecting
  }
  function refreshAuthorization(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (refreshing) return refreshing
    refreshing = (async () => {
      const requestGeneration = authorizationGeneration
      const request = new AbortController()
      const cancel = () => { request.abort() }
      lifetime.signal.addEventListener('abort', cancel, { once: true })
      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { timedOut = true; request.abort(); reject(new Error('Authorization deadline exceeded')) }, AUTHORIZATION_TIMEOUT_MS)
        request.signal.addEventListener('abort', () => { reject(new Error('Authorization request cancelled')) }, { once: true })
      })
      try {
        const result = await Promise.race([
          (async () => {
            await connectRemote()
            if (request.signal.aborted || !remoteContext) throw new Error('Account remote unavailable')
            return remoteContext.remote.dshDeepseekChat.authorization(metadata, request.signal)
          })(), deadline,
        ])
        if (disposed || request.signal.aborted || requestGeneration !== authorizationGeneration) return
        if (result.ok) acceptAuthorization(result.value)
        else authorizationFailed('无法连接 CHAT 登录保存服务，请重试连接。')
      } catch {
        if (!disposed && (requestGeneration === authorizationGeneration || mode.getSnapshot().authorization.status === 'pending')) authorizationFailed(timedOut
          ? 'CHAT 登录保存服务连接超时，请检查网络后重试。' : '无法连接 CHAT 登录保存服务，请重试连接。')
      } finally {
        clearTimeout(timer)
        lifetime.signal.removeEventListener('abort', cancel)
      }
    })().finally(() => { refreshing = null })
    return refreshing
  }
  // Authorization records travel only between our guest and the Host vault.
  // They never enter the published UI snapshot, settings, console or error text.
  function sessionFence(generation: number): { accountId: string; epoch: string } | null {
    const current=mode.getSnapshot().authorization
    return !disposed && generation===authorizationGeneration && current.status==='authorized' && current.accountId
      ? {accountId:current.accountId,epoch:current.epoch} : null
  }
  function sameSessionFence(generation: number, fence: {accountId:string;epoch:string}): boolean {
    const current=sessionFence(generation)
    return current!==null && current.accountId===fence.accountId && current.epoch===fence.epoch
  }
  function sessionFailure(code: string='unknown'): void {
    websiteSessionStatus='error'
    // Only fixed carrier codes choose a product message. Never display error details.
    if(code==='gateway/invocation-unavailable' || code==='gateway/definition-unavailable' || code==='gateway/method-unavailable') {
      websiteSessionError='网页登录保存服务尚未更新，请重启 DSH 完成插件升级。'
    } else if(code==='fence') {
      websiteSessionError='CHAT 登录保存服务尚未连接，当前网页登录无法保存，请重试连接。'
    } else {
      websiteSessionError='网页登录状态未能保存或恢复，请重试；当前网页仍可正常使用。'
    }
    publish()
  }
  async function websiteRequest<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const request=new AbortController()
    const cancel=()=>request.abort()
    lifetime.signal.addEventListener('abort',cancel,{once:true})
    if(lifetime.signal.aborted) request.abort()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([operation(request.signal),new Promise<never>((_resolve,reject)=>{
        const abort=()=>reject(new Error('Website session request cancelled'))
        request.signal.addEventListener('abort',abort,{once:true})
        if(request.signal.aborted) abort()
        timer=setTimeout(()=>request.abort(),12_000)
      })])
    } finally {clearTimeout(timer);lifetime.signal.removeEventListener('abort',cancel);request.abort()}
  }
  function clearWebsiteSession(generation: number): Promise<boolean> {
    if (pendingSessionClear) return pendingSessionClear
    const fence=sessionFence(generation)
    if (!fence) return Promise.resolve(false)
    const authenticationRevision=websiteAuthenticationRevision
    const priorSave=pendingSessionSave
    forgettingWebsiteSession=true
    const clearing=(async()=>{
      try {
        // Capture the prior save before publishing this clear barrier. A new login
        // may already appear, but its save must wait for this same clear Promise.
        if (priorSave) await priorSave
        const result=await websiteRequest(async signal=>{
          await connectRemote()
          if (!remoteContext || signal.aborted || !sameSessionFence(generation,fence)) throw new Error('Website session invalidated')
          return remoteContext.remote.dshDeepseekChat.clearWebsiteSession(metadata,fence.epoch,signal)
        })
        if (!sameSessionFence(generation,fence)) return false
        if (!result.ok || !result.value) {
          if (authenticationRevision===websiteAuthenticationRevision) sessionFailure(result.ok ? 'fence' : result.error.code)
          return false
        }
        if (authenticationRevision===websiteAuthenticationRevision) {websiteSessionStatus='idle';websiteSessionError=null;publish()}
        return true
      } catch {
        if (sameSessionFence(generation,fence) && authenticationRevision===websiteAuthenticationRevision) sessionFailure()
        return false
      }
    })().finally(()=>{
      if (pendingSessionClear===clearing) pendingSessionClear=null
      if (!logoutRequested && !logoutFailed) forgettingWebsiteSession=false
    })
    pendingSessionClear=clearing
    return clearing
  }
  bridge = {
    openHandoff: () => { void handoff.open() },
    bindWebsiteHandoff: (generation, port) => {
      if (disposed || generation !== authorizationGeneration) return () => {}
      websiteHandoff = port
      return () => { if (websiteHandoff === port) websiteHandoff = null }
    },
    getSnapshot: () => cached,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    selectMode: selected => { mode.select(selected) },
    refreshAuthorization: () => { void refreshAuthorization() },
    manageAccount: () => { bridge.beginWebsiteSignIn() },
    beginWebsiteSignIn: () => {
      if (disposed || !nativeBrowser || logoutRequested) return
      resetNavigationRefresh()
      if (mode.getSnapshot().mode!=='chat') mode.select('chat')
      restorationBlocked=true
      if (!websiteSignInRequested) websiteAuthenticationRevision++
      websiteSignInRequested=true;websiteAuthenticationStatus='signing-in';webError=null
      // A failed logout must be retried before accepting a new login.
      if (logoutFailed) { bridge.logoutWebsite(); return }
      websiteSessionError=null;publish()
      if (!navigationHandler) void refreshAuthorization()
    },
    toggleSidebar: () => { ctx.layout.toggleSidebar() },
    attachViewport: element => { if (!element) { viewport = null; publish() } },
    updateViewport: next => {
      if (viewport?.left === next?.left && viewport?.top === next?.top && viewport?.width === next?.width && viewport?.height === next?.height) return
      viewport = next; publish()
    },
    updateBrandAnchor: (next, owner) => {
      // A delayed cleanup from the previous slot must not erase a newer seat.
      if (owner && next === null && brandAnchorOwner !== owner) return
      if (owner) brandAnchorOwner = next === null ? null : owner
      if (brandAnchor?.left === next?.left && brandAnchor?.top === next?.top && brandAnchor?.width === next?.width && brandAnchor?.height === next?.height) return
      brandAnchor = next; publish()
    },
    attachSidebar: element => { sidebar?.attach(element) },
    reportWebsiteState: (generation, state) => {
      if (disposed || generation !== authorizationGeneration) return
      const recovered=webError!==null && !state.loading && state.error===null
      webLoading = state.loading; webError = state.error; publish()
      if (recovered && !websiteNavigationRefreshing) {websiteNavigationRefreshError=null;publish()}
    },
    reloadWebsite: () => { resetNavigationRefresh();websiteReloadRevision++;publish() },
    refreshWebsiteNavigation: () => {
      if (disposed || !mode.canEnter() || !nativeBrowser || websiteNavigationRefreshing || webLoading
        || websiteNavigation.authenticated!==true || logoutRequested || logoutFailed
        || ['signing-in','signing-out'].includes(websiteAuthenticationStatus)
        || restoringPreferences || websiteNavigation.settings?.pending) return
      if (!navigationHandler) {websiteNavigationRefreshError='官网页面尚未就绪，请稍后刷新。';publish();return}
      const requestId=++websiteNavigationRefreshRequest
      const generation=authorizationGeneration
      websiteNavigationRefreshing=true;websiteNavigationRefreshError=null;publish()
      void navigationHandler({type:'refresh',requestId,authenticationRevision:websiteAuthenticationRevision}).catch(()=>{
        bridge.reportWebsiteNavigationRefresh(generation,{requestId,refreshing:false,error:'无法刷新官网对话列表，请重试。'})
      })
    },
    reportWebsiteNavigationRefresh: (generation, state) => {
      if (disposed || generation!==authorizationGeneration || state.requestId!==websiteNavigationRefreshRequest || !websiteNavigationRefreshing) return
      websiteNavigationRefreshing=state.refreshing;websiteNavigationRefreshError=state.error;publish()
    },
    reportWebsiteNavigation: (generation, value, newDocument = false) => {
      if (disposed || generation !== authorizationGeneration) return
      let next: typeof websiteNavigation
      try { next=parseWebsiteNavigation(value) } catch { next={status:'unsupported',conversations:[],selectedHref:null,canCreate:false,error:null} }
      const previousNavigation=websiteNavigation
      if (next.status==='unsupported' && !logoutRequested && !logoutFailed) {
        // Fallback cancels unfinished public settings phases in the guest.
        // Resume the preference/read request only after its profile is ready.
        if (restoringPreferences || previousNavigation.settings?.pending) preferencesGeneration=-1
        restoringPreferences=false;restorationSeen=false;settingsReadRequested=false
      }
      if (newDocument || next.status==='sign-in') {
        preferencesGeneration=-1;restoringPreferences=false;restorationSeen=false;settingsReadRequested=false
      }
      if (newDocument && next.authenticated!==true && next.status!=='sign-in' && !logoutRequested && !logoutFailed) {
        websiteAuthenticationStatus=websiteSignInRequested ? 'signing-in' : 'loading'
      }
      if (next.status==='sign-in') {
        if (websiteHadSession || logoutRequested) restorationBlocked=true
        if (logoutVaultCleared) {websiteSessionStatus='idle';websiteSessionError=null}
        if (websiteHadSession || logoutRequested) websiteAuthenticationRevision++
        clearTimeout(logoutTimer);logoutTimer=undefined
        logoutRequested=false;logoutFailed=false;forgettingWebsiteSession=false;websiteHadSession=false;websiteSignedOut=true
        websiteAuthenticationStatus=websiteSignInRequested ? 'signing-in' : 'signed-out'
        preferenceError=null
        // Public navigation and nickname are cleared together for both surfaces.
        websiteNavigation=next
      } else if (logoutRequested) {
        // The site's old sidebar can survive briefly after its logout click.
        // Never republish that account, replay preferences or save its grant.
        websiteNavigation=emptyNavigation()
        if (next.settings?.error && !next.settings.pending && logoutTimer!==undefined) failWebsiteLogout('官网退出未完成，请重试退出登录。此设备已清除登录记忆。')
        publish();return
      } else {
        // A partial React commit or an adapter failure cannot revoke the
        // identity already confirmed in this document. Navigation commands
        // remain unavailable until the current page is fully identified.
        websiteNavigation=!newDocument && next.authenticated!==true && previousNavigation.authenticated===true
          ? {...next,status:next.status==='ready' ? 'loading' : next.status,authenticated:true,accountName:previousNavigation.accountName,settings:next.settings ?? (previousNavigation.settings && {...previousNavigation.settings,pending:next.status==='unsupported' ? false : previousNavigation.settings.pending})}
          : next
        if (next.authenticated===true) {
          if (!websiteHadSession && !logoutFailed) restorationBlocked=false
          if (!websiteHadSession) websiteAuthenticationRevision++
          websiteHadSession=true;websiteSignedOut=false;websiteSignInRequested=false
          logoutVaultCleared=false
          websiteAuthenticationStatus=logoutFailed ? 'error' : 'signed-in'
          if (!logoutFailed && websiteSessionStatus!=='error') websiteSessionError=null
        } else if (!websiteHadSession) websiteAuthenticationStatus=websiteSignInRequested ? 'signing-in' : 'loading'
      }
      if (websiteNavigation.status==='ready' && websiteNavigation.authenticated===true && !websiteNavigationRefreshing
        && websiteNavigationRefreshError==='官网对话列表同步超时，请点击「重新加载」。') websiteNavigationRefreshError=null
      const settings=websiteNavigation.settings
      if (restoringPreferences && settings?.restored===false) restorationSeen=true
      if (restorationSeen && settings?.restored && !settings.pending) restoringPreferences=false
      if (settings?.error && !settings.pending) restoringPreferences=false
      restorePreferences()
      readSettingsWhenReady()
      if (websiteNavigation.status==='ready' && !restoringPreferences && settings?.restored && !settings.pending && !settings.error && !logoutFailed) {
        const language=/中文|Chinese/i.test(settings.language ?? '') ? 'zh-CN' : /English|英语/i.test(settings.language ?? '') ? 'en' : /^(System|跟随系统|系统|Follow system)$/i.test(settings.language ?? '') ? 'system' : ''
        if (language) persistPreference('language',language)
      }
      publish()
    },
    bindWebsiteNavigation: (generation, handler) => {
      if (generation !== authorizationGeneration) return () => {}
      navigationHandler = handler
      restorePreferences()
      readSettingsWhenReady()
      return () => { if (navigationHandler === handler) navigationHandler = null }
    },
    commandWebsite: command => {
      if (disposed || !mode.canEnter() || !navigationHandler) return
      if ((logoutRequested || logoutFailed) && command.type!=='logout' && command.type!=='snapshot') return
      if (websiteNavigationRefreshing && !['logout','snapshot','restore','settings-close'].includes(command.type)) return
      if (websiteNavigation.status!=='ready' && command.type!=='logout' && command.type!=='snapshot' && command.type!=='restore') return
      if (command.type==='settings-read' && (restoringPreferences || websiteNavigation.settings?.pending)) return
      if ((command.type === 'open' || command.type === 'conversation-action') && !websiteNavigation.conversations.some(item => item.href === command.href)) return
      // Native settings needs the adapter's multi-step command to stay active;
      // restoring the original navigation would cancel it at the next poll.
      if (command.type==='settings-read' || command.type==='setting' || command.type==='preferences' || command.type==='logout') {
        showWebsiteNavigation=false; publish()
      }
      if(command.type==='conversation-action') {
        if(conversationActionPending || websiteNavigation.authenticated!==true || websiteNavigation.settings?.pending || settingsOpen) return
        if(!['rename','pin','unpin','share','delete'].includes(command.action)) return
        conversationActionPending=true
        void navigationHandler(command).catch(()=>{}).finally(()=>{conversationActionPending=false})
      } else void navigationHandler(command)
    },
    renameWebsiteConversation: async (href, title) => {
      const trimmed=title.trim()
      const handler=navigationHandler
      if(disposed || !mode.canEnter() || mode.getSnapshot().mode!=='chat' || !handler || conversationActionPending
        || logoutRequested || logoutFailed || websiteNavigationRefreshing || webLoading || settingsOpen
        || websiteNavigation.settings?.pending || restoringPreferences || websiteNavigation.authenticated!==true
        || websiteNavigation.status!=='ready' || !trimmed || trimmed.length>300
        || !websiteNavigation.conversations.some(item=>item.href===href)) throw new Error('官网对话尚未就绪，请稍后重试。')
      const generation=authorizationGeneration, revision=websiteAuthenticationRevision
      conversationActionPending=true
      try {
        await handler({type:'conversation-action',href,action:'rename',title:trimmed})
        if(disposed || generation!==authorizationGeneration || revision!==websiteAuthenticationRevision || websiteNavigation.authenticated!==true) throw new Error('登录状态已变化，请重新打开对话列表。')
        if(websiteNavigation.error) throw new Error(websiteNavigation.error)
        if(!websiteNavigation.conversations.some(item=>item.href===href && item.title===trimmed)) throw new Error('官网尚未确认新名称，请刷新列表后重试。')
      } finally {conversationActionPending=false}
    },
    toggleWebsiteNavigation: () => { showWebsiteNavigation = !showWebsiteNavigation; publish() },
    setSettingsOpen: next => {
      if (settingsOpen === next) return
      const opening = !settingsOpen && next
      if(opening) settingsReadRequested=false
      settingsOpen=next;publish()
      if(!next && navigationHandler) void navigationHandler({type:'settings-close'})
      else readSettingsWhenReady()
    },
    logoutWebsite: () => {
      if (logoutRequested || !navigationHandler || (!websiteHadSession && !logoutFailed)) return
      if (!logoutFailed && websiteNavigation.status!=='ready') return
      resetNavigationRefresh()
      const generation=authorizationGeneration
      const handler=navigationHandler
      clearTimeout(logoutTimer);logoutTimer=undefined
      logoutRequested=true;restorationBlocked=true;logoutFailed=false;logoutVaultCleared=false;forgettingWebsiteSession=true;websiteSignInRequested=false
      websiteAuthenticationStatus='signing-out';websiteAuthenticationRevision++
      websiteNavigation=emptyNavigation();websiteSessionError=null;preferenceError=null
      settingsReadRequested=false;restoringPreferences=false;restorationSeen=false;preferencesGeneration=-1
      publish()
      void clearWebsiteSession(generation).then(cleared=>{
        if (disposed || generation!==authorizationGeneration || !logoutRequested) return
        if (!cleared) { failWebsiteLogout('无法清除已保存的网页登录，退出未完成。请重试退出登录。');return }
        logoutVaultCleared=true
        logoutTimer=setTimeout(()=>{
          logoutTimer=undefined
          if (disposed || generation!==authorizationGeneration || !logoutRequested) return
          failWebsiteLogout('官网退出未完成，请重试退出登录。此设备已清除登录记忆。')
        },20_000)
        // Use the same retained guest. Website logout is a normal, visible menu action.
        void handler({type:'logout'}).catch(()=>{
          if (!disposed && generation===authorizationGeneration && logoutRequested) failWebsiteLogout('官网退出未完成，请重试退出登录。此设备已清除登录记忆。')
        })
      })
    },
    loadWebsiteSession: async generation => {
      const fence=sessionFence(generation)
      const authenticationRevision=websiteAuthenticationRevision
      if(!fence || restorationBlocked || logoutRequested || forgettingWebsiteSession || logoutFailed) return null
      try {
        const result=await websiteRequest(async signal=>{
          await connectRemote()
          if(!remoteContext || signal.aborted || !sameSessionFence(generation,fence) || authenticationRevision!==websiteAuthenticationRevision || restorationBlocked || logoutRequested || forgettingWebsiteSession || logoutFailed) throw new Error('Website session invalidated')
          return remoteContext.remote.dshDeepseekChat.loadWebsiteSession(metadata,fence.epoch,signal)
        })
        if(!sameSessionFence(generation,fence) || authenticationRevision!==websiteAuthenticationRevision || restorationBlocked || logoutRequested || forgettingWebsiteSession || logoutFailed) return null
        if(!result.ok){sessionFailure(result.error.code);return null}
        websiteSessionStatus='idle';websiteSessionError=null;publish()
        return result.value
      } catch {if(sameSessionFence(generation,fence) && authenticationRevision===websiteAuthenticationRevision && !restorationBlocked && !logoutRequested && !forgettingWebsiteSession && !logoutFailed) sessionFailure();return null}
    },
    saveWebsiteSession: (generation,session) => {
      const fence=sessionFence(generation)
      const authenticationRevision=websiteAuthenticationRevision
      if (!fence || logoutRequested || websiteSignedOut || logoutFailed || (forgettingWebsiteSession && !pendingSessionClear)) return Promise.resolve(false)
      const sameLogin=()=>sameSessionFence(generation,fence) && authenticationRevision===websiteAuthenticationRevision
        && !logoutRequested && !websiteSignedOut && !logoutFailed
      if (pendingSessionSave) {
        if (pendingSessionSaveRevision===authenticationRevision) return pendingSessionSave
        return pendingSessionSave.then(()=>sameLogin() ? bridge.saveWebsiteSession(generation,session) : false)
      }
      const priorClear=pendingSessionClear
      const saving=(async()=>{
        try {
          if (priorClear) await priorClear
          if (!sameLogin() || forgettingWebsiteSession) return false
          const result=await websiteRequest(async signal=>{
            await connectRemote()
            if (!remoteContext || signal.aborted || !sameLogin() || forgettingWebsiteSession) throw new Error('Website session invalidated')
            return remoteContext.remote.dshDeepseekChat.saveWebsiteSession(metadata,fence.epoch,session,signal)
          })
          if (!sameLogin() || forgettingWebsiteSession) return false
          if (!result.ok) {sessionFailure(result.error.code);return false}
          if (!result.value) {sessionFailure('fence');return false}
          websiteSessionStatus='saved';websiteSessionError=null;publish();return true
        } catch {if (sameLogin() && !forgettingWebsiteSession) sessionFailure();return false}
      })()
      pendingSessionSave=saving;pendingSessionSaveRevision=authenticationRevision
      void saving.finally(()=>{if(pendingSessionSave===saving) {pendingSessionSave=null;pendingSessionSaveRevision=-1}})
      return saving
    },
    clearWebsiteSession,
    reportWebsiteSessionError: (generation,message) => {
      if(!sessionFence(generation) || logoutRequested || forgettingWebsiteSession || logoutFailed) return
      if(websiteSessionStatus==='error' && websiteSessionError===message) return
      websiteSessionStatus='error';websiteSessionError=message;publish()
    },
  }
  function failWebsiteLogout(message: string): void {
    clearTimeout(logoutTimer);logoutTimer=undefined
    logoutRequested=false;logoutFailed=true;forgettingWebsiteSession=true
    websiteAuthenticationStatus='error';websiteSessionStatus='error';websiteSessionError=message
    publish()
  }
  function readSettingsWhenReady(): void {
    if(!settingsOpen || !navigationHandler || websiteNavigation.status!=='ready' || websiteNavigation.authenticated!==true || settingsReadRequested || restoringPreferences || logoutRequested || logoutFailed || websiteNavigation.settings?.pending) return
    settingsReadRequested=true
    // Preference restoration already reads the public language value; reuse it.
    if (websiteNavigation.settings?.language && !websiteNavigation.settings.error) return
    void navigationHandler({type:'settings-read'})
  }
  function restorePreferences(): void {
    if (!preferences || !navigationHandler || websiteNavigation.status!=='ready' || websiteNavigation.authenticated!==true || preferencesGeneration===authorizationGeneration || logoutRequested || logoutFailed || websiteNavigation.settings?.pending) return
    const language = preferences.language || DEFAULT_WEBSITE_LANGUAGE
    preferencesGeneration=authorizationGeneration;restoringPreferences=true;restorationSeen=false
    void navigationHandler({type:'preferences',language})
  }
  function persistPreference(key:'language', value:string): void {
    if (!preferenceForm || !preferences || preferences[key]===value || pendingPreferences.get(key)===value) return
    pendingPreferences.set(key,value)
    void preferenceForm.set(key,value).then(accepted=>{if(!accepted) throw new Error('refused');preferenceError=null},()=>{preferenceError='CHAT偏好未能保存，请检查DSH设置连接。'}).catch(()=>{preferenceError='CHAT偏好未能保存，请检查DSH设置连接。'}).finally(()=>{if(pendingPreferences.get(key)===value) pendingPreferences.delete(key);publish()})
  }
  ctx.inject(['configForms'], child => {
    child.effect(() => {
      const form=child.configForms.get<{language:string}>(HOST_ENTRY_ID)
      preferenceForm=form
      const read=()=>{
        const snapshot=form.getSnapshot()
        if(snapshot.status==='ready' && snapshot.value){preferences=snapshot.value;preferenceError=snapshot.writable===false ? '当前DSH连接不能持久保存CHAT偏好。' : null;restorePreferences()}
        else if(snapshot.status==='unavailable') preferenceError='DSH未提供CHAT偏好配置，当前修改不能跨重启保存。'
        publish()
      }
      const stop=form.subscribe(read);read()
      return ()=>{stop();preferenceForm=null;preferences=null}
    })
  })
  sidebar = createSidebarBinding(() => {
    const state = mode.getSnapshot()
    return { chat: state.mode === 'chat', canCreate: mode.canEnter() && websiteNavigation.canCreate }
  }, () => bridge.commandWebsite({ type: 'new' }), ready => {
    if (sidebarAdapted !== ready) { sidebarAdapted = ready; publish() }
  })
  publish()
  // The enclosing effect's final cleanup restores navigation before registered main keys disappear.
  ctx.effect(() => {
    const guardedEntries = new Map<ReturnType<typeof ctx.slots.entries>[number], () => void>()
    const guardSearch = () => {
      const current = ctx.slots.entries('sidebar.workspaces')
      for (const [entry, cleanup] of guardedEntries) if (!current.includes(entry)) {cleanup();guardedEntries.delete(entry)}
      for (const entry of ctx.slots.entries('sidebar.workspaces')) {
        if (guardedEntries.has(entry)) continue
        const cleanup = guardHarnessSearchReplay(entry)
        if (cleanup) guardedEntries.set(entry, cleanup)
      }
    }
    guardSearch()
    const stopSearchGuard = ctx.slots.subscribe('sidebar.workspaces',guardSearch)
    const releaseStyles = typeof document === 'undefined' ? () => {} : acquireChatStyles(document)
    ctx.slots.inject('settings.section', () => ctx.slots.register({name:'settings.section',id:'dsh-deepseek-chat.chat-settings',order:80,label:'CHAT设置',inject:()=>({bridge})}, DshChatChatSettings))
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: CHAT_PANEL, inject: () => ({ bridge }) }, DshChatChatPanel))
    ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -100, inject: () => ({ bridge }) }, DshChatBrandName))
    ctx.slots.inject('shell.overlay', () => [
      ctx.slots.register({ name: 'shell.overlay', id: 'dsh-deepseek-chat.website', order: 90, inject: () => ({ bridge, nativeBrowser }) }, DshChatWebSurface),
      ctx.slots.register({ name: 'shell.overlay', id: 'dsh-deepseek-chat.handoff', order: 100, inject: () => ({ controller: handoff }) }, DshChatHandoffDialog),
    ])
    ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
      name: 'conversation.input.left', id: 'dsh-deepseek-chat.handoff-insertion',
      inject: sessionId => ({ controller: handoff, sessionId: String(sessionId) }),
    }, DshChatHandoffInsertion))
    const stopMode = mode.subscribe(publish)
    const stopPanel = ctx.layout.panelInfo.subscribe(() => { mode.observePanel(ctx.layout.panelInfo.getSnapshot().activePanelId) })
    const refreshOnFocus = () => { void refreshAuthorization() }
    globalThis.addEventListener('focus', refreshOnFocus)
    void refreshAuthorization()
    return () => {
      clearTimeout(logoutTimer)
      websiteHandoff = null; handoff.dispose()
      stopSearchGuard(); for (const cleanup of guardedEntries.values()) cleanup(); guardedEntries.clear()
      mode.dispose(); sidebar?.dispose(); releaseStyles(); stopPanel(); stopMode(); disposed = true; lifetime.abort(); listeners.clear()
      globalThis.removeEventListener('focus', refreshOnFocus)
    }
  }, 'dsh-deepseek-chat reversible website UI')
}
