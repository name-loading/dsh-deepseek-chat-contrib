/** Own UI plus the user's narrowly approved, reversible rc.2 sidebar markers. */
export const chatStyles = String.raw`
.dsh-chat-handoff-entry{display:flex;align-items:center;justify-content:center;gap:7px;box-sizing:border-box;width:calc(100% - 20px);min-height:38px;margin:10px 10px 6px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l4,#d8dce4);border-radius:9px;background:var(--dsw-alias-interactive-bg-hover,#eceef2);color:var(--dsw-alias-label-primary,#22242a);font-size:13px;font-weight:500;line-height:20px;cursor:pointer}
.dsh-chat-handoff-entry:hover:not(:disabled){border-color:var(--dsw-alias-border-l3,#c9cfd8);background:var(--dsw-alias-interactive-bg-hover,#e4e7ec)}
.dsh-chat-handoff-entry:disabled{opacity:.5;cursor:default}
.dsh-chat-handoff-entry svg,.dsh-chat-handoff-leading svg{flex:none}
.dsh-chat-leading .dsh-chat-handoff-leading{display:inline-flex;align-items:center;gap:5px;width:auto;min-width:0;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l4,#d8dce4);border-radius:7px;background:var(--dsw-alias-interactive-bg-hover,#eceef2);color:var(--dsw-alias-label-primary,#22242a);font-size:12px;font-weight:500;line-height:18px;white-space:nowrap;cursor:pointer}
.dsh-chat-leading .dsh-chat-handoff-leading:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#e4e7ec)}
.dsh-chat-leading .dsh-chat-handoff-leading:disabled{opacity:.5;cursor:default}
.dsh-chat-handoff-modal{width:min(920px,94vw)!important;max-width:min(920px,94vw)!important;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 82%,transparent)!important;backdrop-filter:blur(20px) saturate(125%);-webkit-backdrop-filter:blur(20px) saturate(125%)}
.dsh-chat-handoff-content{width:100%;max-height:min(80vh,820px);overflow-y:auto}
.dsh-chat-handoff-body{font-size:13px;line-height:1.6;display:grid;gap:16px;min-width:0}
.dsh-chat-handoff-body p{margin:7px 0;color:var(--dsw-alias-label-secondary,#69717d)}
.dsh-chat-handoff-capture{display:grid;gap:8px;min-width:0}
.dsh-chat-handoff-capture-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dsh-chat-handoff-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#69717d)}
.dsh-chat-handoff-model{display:grid;gap:8px;min-width:0;border:1px solid var(--dsw-alias-border-l4,#d8dce4);border-radius:10px;padding:12px}
.dsh-chat-handoff-model label{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-chat-handoff-model select{max-width:100%;font:inherit;color:inherit;background:var(--dsw-alias-bg-base,transparent);border:1px solid var(--dsw-alias-border-l4,#d8dce4);border-radius:6px;padding:6px 8px}
.dsh-chat-handoff-fields{min-width:0;border:1px solid var(--dsw-alias-border-l4,#d8dce4);border-radius:10px;padding:12px}
.dsh-chat-handoff-fields legend{padding:0 6px;font-weight:600}
.dsh-chat-handoff-fields select,.dsh-chat-handoff-fields input:not([type=checkbox]),.dsh-chat-handoff-fields textarea{max-width:100%;font:inherit;color:inherit;background:var(--dsw-alias-bg-base,transparent);border:1px solid var(--dsw-alias-border-l4,#d8dce4);border-radius:6px;padding:6px 8px}
.dsh-chat-handoff-checkbox{display:flex;align-items:flex-start;gap:7px}
.dsh-chat-handoff-transcript{margin-top:10px}
.dsh-chat-handoff-transcript>summary{cursor:pointer;font-weight:600}
.dsh-chat-handoff-preview{max-height:420px;overflow:auto;border:1px solid var(--dsw-alias-border-l4,#d8dce4);padding:10px;border-radius:6px}
.dsh-chat-handoff-turn{border-bottom:1px solid var(--dsw-alias-border-l4,#d8dce4);padding:2px 0}
.dsh-chat-handoff-turn:last-child{border-bottom:0}
.dsh-chat-handoff-turn-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
.dsh-chat-handoff-turn-toolbar span{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#69717d)}
.dsh-chat-handoff-turn-check{flex:none;margin:0}
.dsh-chat-handoff-turn>summary{display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 0;font-weight:500}
.dsh-chat-handoff-turn-index{flex:none;min-width:18px;font-size:11px;line-height:18px;text-align:center;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,#eceef2);color:var(--dsw-alias-label-secondary,#69717d)}
.dsh-chat-handoff-turn-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-chat-handoff-turn-body{padding:2px 0 8px}
.dsh-chat-handoff-role{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#69717d)}
.dsh-chat-handoff-message pre{margin:4px 0 10px;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
.dsh-chat-handoff-message+.dsh-chat-handoff-message{border-top:1px solid var(--dsw-alias-border-l4,#d8dce4);padding-top:10px;margin-top:6px}
.dsh-chat-handoff-error{color:var(--dsw-alias-state-error-primary,#d94848)!important}
.dsh-chat-handoff-insertion{display:flex;align-items:center;gap:6px;flex-wrap:wrap;max-width:100%;font-size:12px}
.dsh-chat-rename-input{box-sizing:border-box;width:100%;height:44px;padding:7px 14px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);outline:none;background:transparent;font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-primary)}
.dsh-chat-rename-input:disabled{color:var(--dsw-alias-label-dimmed)}
.dsh-chat-rename-error{margin-top:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.dsh-chat-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.dsh-chat-navigation,.dsh-chat-brand-control,.dsh-chat-brand-name,.dsh-chat-main-anchor,.dsh-chat-web-surface{font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);color:var(--dsw-alias-label-primary,#22242a);box-sizing:border-box;font-size:14px}
.dsh-chat-navigation *,.dsh-chat-brand-control *,.dsh-chat-brand-name *,.dsh-chat-main-anchor *,.dsh-chat-web-surface *,.dsh-chat-settings *{box-sizing:border-box}
.dsh-chat-navigation button,.dsh-chat-brand-control button,.dsh-chat-main-anchor button,.dsh-chat-web-surface button,.dsh-chat-settings button{font:inherit;-webkit-app-region:no-drag}
.dsh-chat-navigation button:focus-visible,.dsh-chat-brand-control button:focus-visible,.dsh-chat-main-anchor button:focus-visible,.dsh-chat-web-surface button:focus-visible,.dsh-chat-settings button:focus-visible{outline:2px solid #4d6bfe;outline-offset:3px}
.dsh-chat-modes{display:flex;align-items:center;gap:2px;border:0;padding:3px;margin:0;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover,#e7e9ed);min-width:0;width:max-content}
.dsh-chat-modes button{padding:6px 9px;border:0;background:transparent;border-radius:6px;color:inherit;font-size:10px;font-weight:650;letter-spacing:.35px;white-space:nowrap;cursor:pointer;min-height:27px}
.dsh-chat-modes button[aria-pressed="true"]{background:#fff;color:#242832;box-shadow:0 1px 3px #151e2f15}
.dsh-chat-modes:disabled{opacity:.42}.dsh-chat-modes:disabled button{cursor:not-allowed}
.dsh-chat-mode-compact .dsh-chat-modes{flex-direction:column;width:30px;gap:3px}.dsh-chat-mode-compact .dsh-chat-modes button{width:24px;padding:4px 2px}
[data-dsh-chat-brand-fill="identity"]{flex:1;width:100%}
[data-dsh-chat-brand-fill="name"]{flex:1}
[data-dsh-chat-sidebar-mode="chat"] > [data-dsh-chat-panel-region="true"]{display:none}
[data-dsh-chat-sidebar-mode="chat"] [data-dsh-chat-new-session="true"]:disabled{opacity:.45;cursor:default}
.dsh-chat-brand-name{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;flex:1;width:100%}
.dsh-chat-brand-wordmark{display:block;flex:0 1 102px;min-width:0;width:102px;height:24px;overflow:hidden}
.dsh-chat-brand-wordmark svg{display:block;width:156px;max-width:none;height:24px}
.dsh-chat-brand-control-host{display:flex;align-items:center;width:112px;height:24px;flex:none;margin-left:auto;-webkit-app-region:no-drag}
.dsh-chat-brand-control{position:relative;width:100%;height:24px;pointer-events:auto;display:flex;align-items:center;-webkit-app-region:no-drag}
.dsh-chat-brand-control .dsh-chat-modes{height:23px;min-height:23px;max-height:23px;padding:1px;border-radius:5px;gap:0;overflow:hidden}
.dsh-chat-brand-control .dsh-chat-mode-wrap,.dsh-chat-brand-control .dsh-chat-modes{width:100%}
.dsh-chat-brand-control .dsh-chat-modes button{flex:1}
.dsh-chat-brand-control .dsh-chat-modes button{display:inline-flex;align-items:center;justify-content:center;font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);padding:0 6px;height:21px;min-height:21px;max-height:21px;font-size:9px;line-height:13px;letter-spacing:.2px;border-radius:4px}
.dsh-chat-brand-control .dsh-chat-modes button[aria-pressed="true"]{box-shadow:none}
.dsh-chat-brand-control .dsh-chat-modes button:focus-visible{outline-offset:-2px}
.dsh-chat-authorization-notice{position:absolute;top:calc(100% + 6px);right:0;width:230px;max-width:calc(100vw - 24px);padding:10px 12px;z-index:40;border:1px solid var(--dsw-alias-border-l2,#dee1e8);border-radius:8px;background:var(--dsw-specific-sidebar-fill,#f4f5f8);box-shadow:0 4px 16px #0d1a3520;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-primary,#22242a)}
.dsh-chat-authorization-notice p{margin:0 0 5px}
.dsh-chat-navigation{display:flex;flex-direction:column;height:100%;min-height:0;background:transparent;color:inherit}
.dsh-chat-navigation-header{margin:2px 12px 4px;padding:0 4px}
.dsh-chat-navigation-header{box-sizing:border-box;border-radius:var(--dsw-radius-md);height:36px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:flex-end;align-items:center;gap:4px;margin-bottom:4px;padding-left:4px;display:flex;overflow:hidden}
.dsh-chat-search-label{white-space:nowrap;opacity:1;visibility:visible;min-width:0;max-width:45%;transition:max-width .18s var(--ds-ease-in-out), margin-right .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear;flex:none;line-height:20px;overflow:hidden}
[data-searching] .dsh-chat-search-label{opacity:0;visibility:hidden;max-width:0;margin-right:-4px;transition-delay:0s,0s,0s,0s,.18s;transform:translate(-4px)}
.dsh-chat-search-slot{box-sizing:border-box;min-width:0;max-width:28px;transition:max-width .18s var(--ds-ease-in-out), padding-left .18s var(--ds-ease-in-out);flex:1;align-items:center;margin-left:auto;padding-left:0;display:flex}
[data-searching] .dsh-chat-search-slot{max-width:100%;padding-left:0}
.dsh-chat-search-actions{opacity:1;visibility:visible;max-width:60px;transition:max-width .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear;flex:none;align-items:center;gap:4px;display:flex;overflow:hidden}
[data-searching] .dsh-chat-search-actions{opacity:0;visibility:hidden;pointer-events:none;max-width:0;transition-delay:0s,0s,0s,.18s;transform:translate(4px)}
.dsh-chat-search{box-sizing:border-box;border-radius:var(--dsw-radius-sm);cursor:text;width:100%;height:28px;color:var(--dsw-alias-label-secondary);transition:width .18s var(--ds-ease-in-out), padding .18s var(--ds-ease-in-out), border-color .18s var(--ds-ease-in-out), background-color .18s var(--ds-ease-in-out);background:0 0;border:none;flex:none;align-items:center;gap:0;margin:0;padding:0;display:flex;overflow:hidden}
[data-searching] .dsh-chat-search{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);width:calc(100% + 4px);height:30px;color:var(--dsw-alias-label-caption);background:0 0;margin-inline:-2px;padding:0 4px 0 0}
.dsh-chat-search-button{border-radius:var(--dsw-radius-sm);cursor:pointer;width:28px;height:28px;color:inherit;background:0 0;border:none;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}
[data-searching] .dsh-chat-search .dsh-chat-search-button{width:28px;height:30px}
.dsh-chat-search-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
[data-searching] .dsh-chat-search .dsh-chat-search-button:hover{background:0 0}
.dsh-chat-search-input{opacity:0;pointer-events:none;width:0;min-width:0;color:var(--dsw-alias-label-primary);transition:opacity .12s var(--ds-ease-in-out);background:0 0;border:none;outline:none;flex:1;font-size:13px;line-height:18px}
[data-searching] .dsh-chat-search .dsh-chat-search-input{opacity:1;pointer-events:auto;margin-left:-2px}
.dsh-chat-search-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.dsh-chat-search-clear{border-radius:var(--dsw-radius-sm);cursor:pointer;width:24px;height:24px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}
.dsh-chat-search-button:focus-visible,.dsh-chat-search-clear:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dsh-chat-search-clear:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-chat-icon-button{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#8b8d91);cursor:pointer;font-size:21px!important}.dsh-chat-icon-button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff0d)}.dsh-chat-icon-button:disabled{opacity:.4;cursor:default}
.dsh-chat-refreshing{animation:dsh-chat-refresh-spin .8s linear infinite}@keyframes dsh-chat-refresh-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.dsh-chat-refreshing{animation:none}.dsh-chat-search,.dsh-chat-search-label,.dsh-chat-search-slot,.dsh-chat-search-input,.dsh-chat-search-actions{transition:none}}
.dsh-chat-navigation-list{flex:1;min-height:0;overflow:auto;padding:0 12px 12px;scrollbar-width:thin}
.dsh-chat-conversation-group h3{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary,#8b8d91);margin:15px 4px 6px}
.dsh-chat-conversation-row{display:block;flex:1;min-width:0;width:100%;min-height:32px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font-size:13px;cursor:pointer}.dsh-chat-conversation-item{display:flex;align-items:center;border-radius:8px;padding-right:4px;min-width:0}
.dsh-chat-conversation-item:hover,.dsh-chat-conversation-item[data-menu-open]{background:var(--dsw-alias-interactive-bg-hover,#ffffff0d)}
.dsh-chat-conversation-item[data-selected]{background:var(--dsw-alias-interactive-bg-active,#ffffff14)}
.dsh-chat-conversation-more{opacity:0;flex:none;width:24px;height:24px}
.dsh-chat-conversation-item:hover .dsh-chat-conversation-more,.dsh-chat-conversation-item:focus-within .dsh-chat-conversation-more,.dsh-chat-conversation-item[data-selected] .dsh-chat-conversation-more,.dsh-chat-conversation-item[data-menu-open] .dsh-chat-conversation-more{opacity:1}
@media(hover:none){.dsh-chat-conversation-more{opacity:1}}
.dsh-chat-navigation-status{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary,#8b8d91);padding:6px 4px}
.dsh-chat-navigation-rail{align-items:center;padding-top:6px}
.dsh-chat-text-button{padding:7px 4px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#8b8d91);font-size:11px!important;cursor:pointer}
.dsh-chat-primary-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:144px;min-height:40px;padding:10px 20px;border:1px solid #4d6bfe;border-radius:8px;background:#4d6bfe;color:#fff;font-size:14px!important;font-weight:600!important;line-height:20px;white-space:nowrap;cursor:pointer;pointer-events:auto;-webkit-app-region:no-drag}.dsh-chat-primary-button:hover{background:#617dff;border-color:#617dff}.dsh-chat-primary-button:active{background:#3b58e8;border-color:#3b58e8}.dsh-chat-primary-button:disabled{opacity:.5;cursor:default}
.dsh-chat-main-anchor{height:100%;min-width:0;width:100%;position:relative;background:var(--dsw-alias-bg-base,#fff)}
.dsh-chat-web-surface{position:fixed;z-index:20;pointer-events:auto;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#fff);overflow:hidden}
.dsh-chat-web-content{position:relative;flex:1;min-height:0;display:flex}.dsh-chat-webview{display:flex;width:100%;height:100%;flex:1;border:0}
.dsh-chat-session-error{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:2;max-width:calc(100% - 32px);padding:8px 12px;border-radius:8px;background:#362725;color:#ffb4a8;font-size:12px;line-height:1.5;pointer-events:none}
.dsh-chat-web-status{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100% - 40px));text-align:center;padding:22px;border:1px solid var(--dsw-alias-border-l2,#e4e9f0);border-radius:12px;background:var(--dsw-alias-bg-base,#fff);font-size:12px;line-height:1.8;pointer-events:none}.dsh-chat-web-status strong{display:block;font-size:15px;font-weight:550;margin-bottom:9px}.dsh-chat-web-status p{color:var(--dsw-alias-label-secondary,#8190a2);margin:0}.dsh-chat-web-status-error{color:#a24f40}
.dsh-chat-unavailable{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}.dsh-chat-unavailable h2{font-size:20px;font-weight:550}.dsh-chat-unavailable p{color:var(--dsw-alias-label-secondary,#8190a2);font-size:12px}.dsh-chat-unavailable button{margin-top:18px;border:0;border-radius:8px;background:#4d6bfe;color:#fff;padding:10px 18px;cursor:pointer}
.dsh-chat-web-status button{pointer-events:auto;margin-top:12px}
.dsh-chat-leading{display:flex;align-items:center;gap:8px}
.dsh-chat-leading button{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;-webkit-app-region:no-drag}
.dsh-chat-leading button:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-chat-leading button:disabled{opacity:.4;cursor:default}
 .dsh-chat-settings{font-family:var(--dsw-font-family,system-ui);color:var(--dsw-alias-label-primary);font-size:14px;min-width:0}.dsh-chat-settings h2{margin:0 0 20px;font-size:20px}
.dsh-chat-settings-card{border:1px solid var(--dsw-alias-border-primary,#ffffff15);border-radius:12px;padding:24px;background:var(--dsw-alias-bg-base,#202124)}.dsh-chat-settings-status strong{display:block;font-size:16px;font-weight:600}.dsh-chat-settings-status p{margin:10px 0 20px;color:var(--dsw-alias-label-secondary,#aaa);line-height:1.7}.dsh-chat-settings-status .dsh-chat-settings-error{color:#ff8585}.dsh-chat-settings-language{display:flex;align-items:center;justify-content:space-between;gap:24px;border-top:1px solid #ffffff15;padding-top:20px}.dsh-chat-settings-select{position:relative;display:inline-flex;flex:none;min-width:140px}.dsh-chat-settings-language select{box-sizing:border-box;width:100%;appearance:none;-webkit-appearance:none;font:inherit;color:inherit;background:var(--dsw-alias-bg-base,#202124);border:1px solid #ffffff25;border-radius:8px;padding:8px 38px 8px 12px;min-width:140px}.dsh-chat-settings-select-arrow{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:12px;height:12px;pointer-events:none}.dsh-chat-settings-language select:disabled+.dsh-chat-settings-select-arrow{opacity:.4}.dsh-chat-settings-account p,.dsh-chat-settings-progress{font-size:12px;color:var(--dsw-alias-label-secondary,#aaa)}
.dsh-chat-settings-account{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px;min-width:0}.dsh-chat-settings-account>div{flex:1 1 0%;min-width:0;max-width:100%}.dsh-chat-settings-account strong{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-chat-settings-account button{flex-shrink:0;white-space:nowrap;padding:8px 14px;border:1px solid #ff5f64;border-radius:8px;background:transparent;color:#ff5f64;cursor:pointer;font:inherit}.dsh-chat-settings-account button:disabled{opacity:.4;cursor:default}
.dsh-chat-settings-error{color:#ff8585;line-height:1.5;font-size:12px}
`


/** One stylesheet per document, owned by the plugin lifetime rather than a row. */
const styleLeases = new WeakMap<Document, { release(): void; retain(): void; ensure(): void }>()
export function acquireChatStyles(doc: Document): () => void {
  let lease = styleLeases.get(doc)
  if (!lease) {
    const style = doc.createElement('style')
    style.setAttribute('data-dsh-deepseek-chat-styles', 'true')
    let users = 0
    const ensure = () => {
      if (style.textContent !== chatStyles) style.textContent = chatStyles
      if (style.media) style.media = ''
      if (style.hasAttribute('disabled')) style.removeAttribute('disabled')
      if (!style.isConnected) doc.head.appendChild(style)
      if (style.sheet?.disabled) style.sheet.disabled = false
    }
    const observer = new MutationObserver(ensure)
    ensure()
    observer.observe(doc.head, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['disabled', 'media'] })
    const current = {
      ensure,
      retain() { users++; ensure() },
      release() {
        if (--users > 0) return
        observer.disconnect(); style.remove()
        if (styleLeases.get(doc) === current) styleLeases.delete(doc)
      },
    }
    lease = current
    styleLeases.set(doc, current)
  }
  lease.retain()
  let released = false
  return () => { if (!released) { released = true; lease!.release() } }
}

/** CSSOM disabling does not emit a DOM mutation; the brand measurement also checks it. */
export function ensureChatStyles(doc: Document): void { styleLeases.get(doc)?.ensure() }
