import { createPortal } from 'react-dom'
import { createElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { BrandWordmark, IconSearchOutlineRegular, IconCloseFillRegular, IconNewChatOutlineRegular, IconPanelLeftOutlineRegular, IconRefreshOutlineRegular, IconEllipsisOutlineRegular, IconEditOutlineRegular, IconPinOutlineRegular, IconShareOutlineRegular, IconTrashOutlineRegular, IconRightUpOutlineRegular, Menu, Modal, Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComponentType } from 'react'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { acquireChatStyles, ensureChatStyles } from './styles.js'
import type { WebsiteCommand, WebsiteNavigation } from './website-navigation.js'
import type { WebsiteSession } from './protocol.js'
import type { WebsiteHandoffPort } from './handoff-types.js'

export type DshChatMode = 'chat' | 'harness'

export interface DshChatViewportRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Only in-memory navigation metadata; never message bodies or account secrets. */
export interface DshChatViewState {
  readonly mode: DshChatMode
  readonly modeEnabled: boolean
  readonly authorizationStatus: 'pending' | 'authorized' | 'unauthorized' | 'unavailable'
  readonly availabilityMessage: string
  readonly accountLabel: string | null
  readonly error: string | null
  readonly desktopAvailable: boolean
  readonly webLoading: boolean
  readonly webError: string | null
  readonly accountStorageKey: string | null
  readonly authorizationGeneration: number
  readonly websiteReloadRevision: number
  readonly settingsOpen: boolean
  readonly preferenceError: string | null
  readonly websiteAuthenticationStatus: 'loading' | 'signed-out' | 'signing-in' | 'signed-in' | 'signing-out' | 'error'
  readonly websiteAuthenticationRevision: number
  readonly websiteSessionStatus: 'idle' | 'saved' | 'error'
  readonly websiteSessionError: string | null
  readonly viewport: DshChatViewportRect | null
  readonly brandAnchor: DshChatViewportRect | null
  readonly sidebarAdapted: boolean | null
  readonly websiteNavigation: WebsiteNavigation
  readonly websiteNavigationRefreshing: boolean
  readonly websiteNavigationRefreshError: string | null
  readonly showWebsiteNavigation: boolean
}

export interface DshChatUIBridge {
  getSnapshot(): DshChatViewState
  subscribe(listener: () => void): () => void
  openHandoff(): void
  bindWebsiteHandoff(generation: number, port: WebsiteHandoffPort): () => void
  selectMode(mode: DshChatMode): void
  refreshAuthorization(): void
  manageAccount(): void
  beginWebsiteSignIn(): void
  toggleSidebar(): void
  attachViewport(element: HTMLElement | null): void
  updateViewport(rect: DshChatViewportRect | null): void
  updateBrandAnchor(rect: DshChatViewportRect | null, owner?: HTMLElement): void
  attachSidebar(element: HTMLElement): void
  reloadWebsite(): void
  refreshWebsiteNavigation(): void
  reportWebsiteNavigationRefresh(generation: number, state: { readonly requestId: number; readonly refreshing: boolean; readonly error: string | null }): void
  reportWebsiteState(generation: number, state: { readonly loading: boolean; readonly error: string | null }): void
  reportWebsiteNavigation(generation: number, value: unknown, newDocument?: boolean): void
  bindWebsiteNavigation(generation: number, handler: (command: WebsiteCommand) => Promise<void>): () => void
  commandWebsite(command: WebsiteCommand): void
  renameWebsiteConversation(href: string, title: string): Promise<void>
  toggleWebsiteNavigation(): void
  setSettingsOpen(open: boolean): void
  logoutWebsite(): void
  loadWebsiteSession(generation: number): Promise<WebsiteSession | null>
  saveWebsiteSession(generation: number, session: WebsiteSession): Promise<boolean>
  clearWebsiteSession(generation: number): Promise<boolean>
  reportWebsiteSessionError(generation: number, message: string): void
}

export interface DshChatBridgeProps { readonly bridge: DshChatUIBridge }

export function useDshChat(bridge: DshChatUIBridge): DshChatViewState {
  return useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot)
}

export function DshChatStyles() {
  useLayoutEffect(() => acquireChatStyles(document), [])
  return null
}

function PanelIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="2.5" y="3" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M7 3v14" stroke="currentColor" strokeWidth="1.4" />
  </svg>
}

/** rc.2's official wordmark includes its HARNESS badge in the SVG artwork.
 * Crop only our own presentation to the DeepSeek lettering (x=26..128). */
function DshChatWordmark() {
  return <svg className="dsh-chat-brand-wordmark" width="102" height="24" viewBox="0 0 102 24" aria-hidden="true">
    <BrandWordmark includeMark={false} size={24} />
  </svg>
}

export function DshChatModeSelector({ bridge, state, compact = false }: DshChatBridgeProps & {
  readonly state: DshChatViewState
  readonly compact?: boolean
}) {
  const description = useId()
  return <div className={compact ? 'dsh-chat-mode-compact' : 'dsh-chat-mode-wrap'}>
    <fieldset className="dsh-chat-modes" disabled={!state.modeEnabled} aria-describedby={description}>
      <legend className="dsh-chat-sr-only">工作模式</legend>
      <button type="button" aria-label="CHAT 官网聊天模式" aria-pressed={state.mode === 'chat'} onClick={() => bridge.selectMode('chat')} title={state.availabilityMessage}>{compact ? 'C' : 'CHAT'}</button>
      <button type="button" aria-label="HARNESS 工作区模式" aria-pressed={state.mode === 'harness'} onClick={() => bridge.selectMode('harness')} title={state.availabilityMessage}>{compact ? 'H' : 'HARNESS'}</button>
    </fieldset>
    <span id={description} className="dsh-chat-sr-only">{state.availabilityMessage || '选择 CHAT 或 HARNESS 工作模式。'}</span>
  </div>
}

/** Keep interactive controls in the sidebar row, outside its decorative/new-chat brand. */
export function DshChatBrandName({ bridge }: PropsRuntime<'sidebar.brand.name'> & DshChatBridgeProps) {
  const name = useRef<HTMLSpanElement>(null)
  const [controlHost, setControlHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const group = name.current
    if (!group) return
    const host = document.createElement('span')
    host.className = 'dsh-chat-brand-control-host'
    const reconcile = () => {
      if (!group.isConnected) { host.remove(); return }
      bridge.attachSidebar(group)
      const outlet = group.parentElement
      const seat = outlet?.getAttribute('data-slot') === 'sidebar.brand.name' ? outlet.parentElement : outlet
      const identity = seat?.parentElement
      const brand = identity?.parentElement
      const row = brand?.parentElement
      if (!identity || identity.getAttribute('aria-hidden') !== 'true' || !brand || !row?.hasAttribute('data-window-drag')) {
        host.remove()
        return
      }
      // Keep the DOM outside the hidden brand/button; React portal events still
      // follow the brand ancestry and are isolated by DshChatBrandControl.
      if (host.parentElement !== row || brand.nextElementSibling !== host) brand.after(host)
    }
    reconcile()
    setControlHost(host)
    const observer = new MutationObserver(reconcile)
    observer.observe(host.parentElement?.parentElement ?? group, { childList: true, subtree: true })
    // Preserve the independent CSSOM recovery needed after plugin reloads.
    // Position, clipping and sidebar animations are entirely browser-owned.
    const styleRecovery = window.setInterval(() => ensureChatStyles(document), 250)
    return () => {
      observer.disconnect()
      window.clearInterval(styleRecovery)
      host.remove()
    }
  }, [bridge])
  return <><span ref={name} className="dsh-chat-brand-name">
    <DshChatStyles />
    <DshChatWordmark />
  </span>{controlHost && createPortal(<DshChatBrandControl bridge={bridge}/>, controlHost)}</>
}

function DshChatAuthorizationNotice({ bridge, state }: DshChatBridgeProps & { readonly state: DshChatViewState }) {
  if (!state.error) return null
  return <div className="dsh-chat-authorization-notice" role="status">
    <p>{state.error}</p>
    <button type="button" className="dsh-chat-text-button" onClick={() => bridge.refreshAuthorization()}>重试连接</button>
  </div>
}

/** DOM siblings remain React descendants of the Windows New Session brand. */
export function DshChatBrandControl({ bridge }: DshChatBridgeProps) {
  const state = useDshChat(bridge)
  return <div className="dsh-chat-brand-control" aria-label="dsh-deepseek-chat 模式选择"
    onClick={event => event.stopPropagation()}>
    <DshChatStyles />
    <DshChatModeSelector bridge={bridge} state={state} />
    <DshChatAuthorizationNotice bridge={bridge} state={state} />
    {state.sidebarAdapted === false && <div className="dsh-chat-authorization-notice" role="alert">当前侧栏不兼容：顶部新会话仍使用 HARNESS。CHAT 请展开官网导航后新建对话。</div>}
  </div>
}

function DshChatConversationRow({bridge, item, selected, disabled, onRename}: DshChatBridgeProps & {
  item: WebsiteNavigation['conversations'][number]; selected: boolean; disabled: boolean; onRename: () => void
}) {
  const [open, setOpen] = useState(false)
  const pinned = /^(置顶|Pinned|Pin)$/i.test(item.group)
  useLayoutEffect(() => { if (disabled) setOpen(false) }, [disabled])
  return <div className="dsh-chat-conversation-item" data-selected={selected || undefined} data-menu-open={open || undefined}>
    <button type="button" className="dsh-chat-conversation-row" title={item.title} aria-current={selected ? 'page' : undefined} disabled={disabled} onDoubleClick={onRename} onClick={()=>bridge.commandWebsite({type:'open',href:item.href})}>{item.title}</button>
    <Menu open={open && !disabled} portal closeOnPointerLeave onClose={()=>setOpen(false)} anchor={
      <button type="button" className="dsh-chat-conversation-more dsh-chat-icon-button" aria-label={`更多操作：${item.title}`} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(value=>!value)}><IconEllipsisOutlineRegular size={16}/></button>
    } items={[
      {id:'rename',label:'重命名',icon:<IconEditOutlineRegular size={16}/>},
      {id:pinned ? 'unpin' : 'pin',label:pinned ? '取消置顶' : '置顶',icon:<IconPinOutlineRegular size={16}/>},
      {id:'share',label:'分享',icon:<IconShareOutlineRegular size={16}/>},
      {id:'delete',label:'删除',icon:<IconTrashOutlineRegular size={16}/>,danger:true},
    ]} onSelect={action=>{
      setOpen(false)
      if(action==='rename') {onRename();return}
      if(action==='pin' || action==='unpin' || action==='share' || action==='delete') bridge.commandWebsite({type:'conversation-action',href:item.href,action})
    }}/>
  </div>
}

/** Same Modal, buttons, input geometry and IME handling as HARNESS RenameSession. */
function DshChatRenameConversation({bridge, item, onClose}: DshChatBridgeProps & {
  item: WebsiteNavigation['conversations'][number]; onClose: () => void
}) {
  const [draft,setDraft] = useState(item.title)
  const [renaming,setRenaming] = useState(false)
  const [error,setError] = useState<string | null>(null)
  const composing = useRef(false)
  const trimmed = draft.trim()
  const blocked = renaming || trimmed===''
  const close = () => {if(!renaming) onClose()}
  const confirm = () => {
    if(blocked) return
    setRenaming(true);setError(null)
    void bridge.renameWebsiteConversation(item.href,trimmed).then(onClose).catch(reason=>{
      setRenaming(false);setError(reason instanceof Error ? reason.message : '重命名失败，请重试。')
    })
  }
  return <Modal open onClose={close} closeLabel="关闭" title="重命名会话" footer={<>
    <Button variant="outline" disabled={renaming} onClick={close}>取消</Button>
    <Button variant="primary" disabled={blocked} onClick={confirm}>{renaming ? '正在重命名…' : '重命名'}</Button>
  </>}>
    <DshChatStyles/>
    <input className="dsh-chat-rename-input" value={draft} aria-label="会话名称" data-modal-autofocus maxLength={300} disabled={renaming}
      onFocus={event=>event.target.select()} onChange={event=>{setDraft(event.target.value);setError(null)}}
      onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}}
      onKeyDown={event=>{if(event.key==='Enter' && !composing.current && !event.nativeEvent.isComposing){event.preventDefault();confirm()}}}/>
    {error && <div className="dsh-chat-rename-error" role="alert">{error}</div>}
  </Modal>
}

/** rc.2 replays its retained request counter on WorkspaceBrowser remount.
 * Adapt only the view hook; never mutate the host request store or actions. */
export function guardHarnessSearchReplay(entry: StoredEntry): (() => void) | null {
  if (entry.locale !== 'workspace' || typeof entry.component !== 'function'
    || !entry.children?.['sidebar.workspaces.session.menu.item'] || !entry.inject) return null
  const original = entry.component as ComponentType<Record<string, unknown>>
  type SearchState = { searchRequest: number; [key: string]: unknown }
  type SearchHook = <T>(selector: (state: SearchState) => T) => T
  function SearchRequestGuard(props: Record<string, unknown>) {
    const originalHook = props.useWorkspaceShortcuts as SearchHook
    const request = originalHook(state => state.searchRequest)
    const mountedRequest = useRef(request)
    const guardedHook = useCallback<SearchHook>(selector => originalHook(state =>
      selector(state.searchRequest === mountedRequest.current ? {...state, searchRequest: 0} : state)), [originalHook])
    return createElement(original, {...props, useWorkspaceShortcuts: guardedHook})
  }
  function GuardedWorkspace(props: Record<string, unknown>) {
    return typeof props.useWorkspaceShortcuts === 'function'
      ? createElement(SearchRequestGuard,props) : createElement(original,props)
  }
  entry.component = GuardedWorkspace
  return () => { if (entry.component === GuardedWorkspace) entry.component = original }
}

/** Only the middle browsing region changes; the shipped shell and Settings stay mounted. */
export function DshChatChatNavigation({ bridge, wide, expandSidebar }: PropsRuntime<'sidebar.workspaces'> & DshChatBridgeProps) {
  const state = useDshChat(bridge)
  const [renameTarget,setRenameTarget] = useState<WebsiteNavigation['conversations'][number] | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const searchRoot = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const closeSearch = () => {setQuery('');setSearching(false)}
  useLayoutEffect(() => {if (wide && searching) searchInput.current?.focus({preventScroll:true})}, [wide, searching])
  useEffect(() => {
    if (!wide || !searching) return
    const outside = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || searchRoot.current?.contains(event.target)) return
      searchInput.current?.blur()
      if (!query.trim()) setSearching(false)
    }
    document.addEventListener('click',outside)
    return () => document.removeEventListener('click',outside)
  },[wide,searching,query])
  const navigation = state.websiteNavigation
  const refreshing = state.websiteNavigationRefreshing
  const refreshDisabled = !state.modeEnabled || !state.desktopAvailable || refreshing || state.webLoading
    || navigation.authenticated!==true || ['signing-in','signing-out'].includes(state.websiteAuthenticationStatus) || navigation.settings?.pending
  const groups = new Map<string, typeof navigation.conversations[number][]>()
  for (const item of navigation.conversations) {
    if (!item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) continue
    const rows = groups.get(item.group) ?? []
    rows.push(item); groups.set(item.group, rows)
  }
  return <section className={`dsh-chat-navigation${wide ? '' : ' dsh-chat-navigation-rail'}`} aria-label="官网对话导航">
    <DshChatStyles />
    {renameTarget && <DshChatRenameConversation key={renameTarget.href} bridge={bridge} item={renameTarget} onClose={()=>setRenameTarget(null)}/>}
    {!wide ? <button type="button" className="dsh-chat-icon-button" onClick={expandSidebar} aria-label="展开官网对话列表"><PanelIcon /></button> : <>
      <header className="dsh-chat-navigation-header" data-searching={searching || undefined}>
        <span className="dsh-chat-search-label">对话</span>
        <div className="dsh-chat-search-slot">
          <div ref={searchRoot} className="dsh-chat-search" onClick={()=>setSearching(true)}>
            <Tooltip label="搜索官网对话" delayMs={500} disabled={searching}><button ref={searchButton} type="button" className="dsh-chat-search-button" aria-label="搜索官网对话" aria-expanded={searching} onClick={()=>setSearching(true)}><IconSearchOutlineRegular size={searching ? 11 : 14}/></button></Tooltip>
            <input ref={searchInput} className="dsh-chat-search-input" type="text" aria-label="搜索已加载的官网对话标题" placeholder="搜索会话名称" maxLength={300} value={query} tabIndex={searching ? 0 : -1} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape' && !event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();closeSearch();searchButton.current?.focus({preventScroll:true})}}}/>
            {searching && <button type="button" className="dsh-chat-search-clear" aria-label="关闭官网对话搜索" onClick={event=>{event.stopPropagation();closeSearch()}}><IconCloseFillRegular/></button>}
          </div>
        </div>
        <div className="dsh-chat-search-actions"><Tooltip label={refreshing ? '正在刷新官网对话列表…' : '刷新官网对话列表'} delayMs={500}><button type="button" className="dsh-chat-icon-button" aria-label="刷新官网对话列表" aria-busy={refreshing} disabled={refreshDisabled} onClick={()=>bridge.refreshWebsiteNavigation()}><IconRefreshOutlineRegular size={14} className={refreshing ? 'dsh-chat-refreshing' : undefined}/></button></Tooltip></div>
      </header>
      <button type="button" className="dsh-chat-handoff-entry" disabled={navigation.authenticated!==true || state.webLoading || refreshing} onClick={()=>bridge.openHandoff()}><IconRightUpOutlineRegular size={16}/><span>交给 Harness</span></button>
      <div className="dsh-chat-navigation-list">
        {refreshing && <p className="dsh-chat-navigation-status" role="status">正在刷新官网对话列表…</p>}
        {navigation.authenticated===true && navigation.status==='ready' ? <>
          {[...groups].map(([label, rows]) => <section key={label} className="dsh-chat-conversation-group" aria-label={label}>
            <h3>{label}</h3>
            {rows.map(item => <DshChatConversationRow key={item.href} bridge={bridge} item={item} selected={navigation.selectedHref===item.href} disabled={Boolean(refreshDisabled)} onRename={()=>setRenameTarget(item)}/>)}
          </section>)}
          {groups.size === 0 && <p className="dsh-chat-navigation-status">{query ? '没有匹配的对话' : '暂无对话'}</p>}
          {!query && navigation.conversations.length > 0 && <button type="button" className="dsh-chat-text-button" onClick={() => bridge.commandWebsite({type:'more'})}>加载更早的对话</button>}
        </> : <p className="dsh-chat-navigation-status" role="status">{navigation.status === 'sign-in' ? 'CHAT 尚未登录。请在右侧点击登录 DeepSeek，完成后自动显示官网对话。' : navigation.status === 'unsupported' ? '暂未识别官网列表，请使用右侧官网导航。' : '正在加载官网对话…'}</p>}
        {navigation.error && <p className="dsh-chat-navigation-status" role="alert">{navigation.error}</p>}
        {state.websiteNavigationRefreshError && <p className="dsh-chat-navigation-status" role="alert">{state.websiteNavigationRefreshError}</p>}
        {state.websiteNavigationRefreshError==='官网对话列表同步超时，请点击「重新加载」。' && <button type="button" className="dsh-chat-text-button" onClick={()=>bridge.reloadWebsite()} disabled={!state.modeEnabled || !state.desktopAvailable || ['signing-in','signing-out'].includes(state.websiteAuthenticationStatus)}>重新加载</button>}
      </div>
    </>}
  </section>
}

/** Measures only this plugin's own element; website content lives in the retained overlay. */
export function DshChatChatPanel({ bridge }: PropsRuntime<'main'> & DshChatBridgeProps) {
  const state = useDshChat(bridge)
  const anchor = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = anchor.current
    if (element === null) return
    bridge.attachViewport(element)
    const measure = () => {
      const rect = element.getBoundingClientRect()
      bridge.updateViewport({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      bridge.attachViewport(null)
      bridge.updateViewport(null)
    }
  }, [bridge])
  return <div className="dsh-chat-main-anchor" ref={anchor} aria-label="DeepSeek 官网聊天视图">
    <DshChatStyles />
    {!state.desktopAvailable && <div className="dsh-chat-unavailable"><h2>需要 DSH 桌面版</h2><p>当前环境未提供官方内嵌浏览器能力。</p><button type="button" onClick={() => bridge.selectMode('harness')}>返回 HARNESS</button></div>}
  </div>
}

/** Same public primitive icons, geometry and tooltip behavior as native rc.2 chrome. */
export function DshChatLeadingControls({bridge}: PropsRuntime<'shell.leading'> & DshChatBridgeProps) {
  const state = useDshChat(bridge)
  return <div className="dsh-chat-leading"><DshChatStyles />
    <Tooltip label="展开侧边栏" delayMs={500}><button type="button" aria-label="展开侧边栏" onClick={() => bridge.toggleSidebar()}><IconPanelLeftOutlineRegular size={16}/></button></Tooltip>
    <Tooltip label="新建对话" delayMs={500}><button type="button" aria-label="新建官网对话" disabled={!state.modeEnabled || !state.websiteNavigation.canCreate} onClick={() => bridge.commandWebsite({type:'new'})}><IconNewChatOutlineRegular size={16}/></button></Tooltip>
    <button type="button" className="dsh-chat-handoff-leading" disabled={state.websiteNavigation.authenticated!==true || state.webLoading} onClick={()=>bridge.openHandoff()}><IconRightUpOutlineRegular size={14}/><span>交给 Harness</span></button>
  </div>
}

export function DshChatChatSettings({bridge,close}: PropsRuntime<'settings.section'> & DshChatBridgeProps) {
  const state = useDshChat(bridge)
  const enabled = state.desktopAvailable
  useLayoutEffect(() => {
    if (!enabled) { bridge.setSettingsOpen(false); return }
    bridge.setSettingsOpen(true)
    return () => { bridge.setSettingsOpen(false) }
  }, [bridge,enabled])
  const signIn = () => {
    bridge.setSettingsOpen(false)
    close()
    bridge.beginWebsiteSignIn()
  }
  const navigation=state.websiteNavigation
  const settings=navigation.settings
  const showAccount=enabled && navigation.authenticated===true && !['signed-out','signing-in','signing-out'].includes(state.websiteAuthenticationStatus)
  const language=/中文|Chinese/i.test(settings?.language ?? '') ? 'zh-CN' : /English|英语/i.test(settings?.language ?? '') ? 'en' : /^(System|跟随系统|系统|Follow system)$/i.test(settings?.language ?? '') ? 'system' : ''
  return <section className="dsh-chat-settings"><DshChatStyles/><h2>CHAT设置</h2>
    {showAccount && <div className="dsh-chat-settings-card">
      <div className="dsh-chat-settings-account" role="group" aria-label="DeepSeek 官网账号"><div><strong title={navigation.accountName || 'DeepSeek Chat'}>{navigation.accountName || 'DeepSeek Chat'}</strong><p>已登录</p></div><button type="button" disabled={navigation.status!=='ready'} onClick={()=>bridge.logoutWebsite()}>退出登录</button></div>
      {state.websiteSessionStatus==='saved' && <p role="status">已记住网页登录。下次启动会由官网验证并恢复；授权失效时需重新登录。</p>}
      {navigation.status!=='ready' && <p className="dsh-chat-settings-progress" role="status">正在重新识别官网页面，账号登录状态保持不变。</p>}
      <label className="dsh-chat-settings-language">系统语言<span className="dsh-chat-settings-select"><select aria-label="CHAT系统语言" value={language} disabled={navigation.status!=='ready' || settings?.pending || state.websiteAuthenticationStatus==='error'} onChange={event=>bridge.commandWebsite({type:'setting',key:'language',value:event.target.value})}>
        {!language && <option value="" hidden></option>}<option value="system">跟随系统</option><option value="zh-CN">简体中文</option><option value="en">English</option>
      </select><svg className="dsh-chat-settings-select-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none"><path d="m2 4 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span></label>
      {!language && navigation.status==='ready' && !settings?.pending && !settings?.error && <p className="dsh-chat-settings-progress" role="status">尚未读取到官网语言。<button type="button" onClick={()=>bridge.commandWebsite({type:'settings-read'})}>重试</button></p>}
      {navigation.status==='ready' && settings?.pending && <p className="dsh-chat-settings-progress" role="status">正在同步网页设置…</p>}
      {navigation.status==='ready' && settings?.error && <p className="dsh-chat-settings-error" role="alert">{settings.error} <button type="button" onClick={()=>bridge.commandWebsite({type:'settings-read'})}>重试</button></p>}
      {state.preferenceError && <p className="dsh-chat-settings-error" role="alert">{state.preferenceError}</p>}
      {state.websiteSessionError && <p className="dsh-chat-settings-error" role="alert">{state.websiteSessionError} {state.websiteAuthenticationStatus==='error' && /退出/.test(state.websiteSessionError) && <button type="button" onClick={()=>bridge.logoutWebsite()}>重试退出登录</button>}</p>}
    </div>}
    {!enabled && <p role="status">需要 DSH 桌面版的官方网页容器。</p>}
    {enabled && state.websiteAuthenticationStatus==='signed-out' && <div className="dsh-chat-settings-card dsh-chat-settings-status"><strong>CHAT 尚未登录</strong><p>登录会打开 CHAT 对话页面。完成官网登录后，这里的账号与官网对话会自动同步。</p><button type="button" className="dsh-chat-primary-button" onClick={signIn}>登录 DeepSeek</button></div>}
    {enabled && state.websiteAuthenticationStatus==='signing-in' && <div className="dsh-chat-settings-card dsh-chat-settings-status"><strong role="status">正在登录 DeepSeek</strong><p>请在 CHAT 对话页面完成官网登录。登录成功后，账号和登录记忆会自动同步。</p><button type="button" className="dsh-chat-primary-button" onClick={signIn}>继续登录</button></div>}
    {enabled && state.websiteAuthenticationStatus==='signing-out' && <div className="dsh-chat-settings-card dsh-chat-settings-status"><strong role="status">正在退出登录</strong><p>正在清除登录记忆并退出官网…</p></div>}
    {enabled && state.websiteAuthenticationStatus==='error' && !showAccount && <div className="dsh-chat-settings-card dsh-chat-settings-status"><strong>登录状态暂时无法同步</strong><p className="dsh-chat-settings-error" role="alert">{state.websiteSessionError || state.webError || '暂时无法确认官网登录状态，请重试。'}</p>{/退出/.test(state.websiteSessionError ?? '') ? <button type="button" className="dsh-chat-text-button" onClick={()=>bridge.logoutWebsite()}>重试退出登录</button> : <button type="button" className="dsh-chat-text-button" onClick={()=>bridge.reloadWebsite()}>重新加载</button>}</div>}
    {enabled && !showAccount && state.websiteAuthenticationStatus==='loading' && <div className="dsh-chat-settings-card dsh-chat-settings-status"><strong role="status">正在同步官网账号</strong><p>{state.webError || (navigation.status==='unsupported' ? '官网页面已打开，正在同步账号和对话列表…' : '正在识别 DeepSeek 官网登录状态…')}</p><button type="button" className="dsh-chat-text-button" onClick={()=>bridge.reloadWebsite()}>重新加载</button></div>}
  </section>
}
