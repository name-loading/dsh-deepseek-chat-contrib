import type { ChatMessage } from './handoff-types.js'

export interface HandoffDomMessage extends ChatMessage { stable: boolean; complete?: boolean }
export interface HandoffDomFrame {
  url: string; title: string; branch: string; messages: HandoffDomMessage[]
  top: boolean; bottom: boolean; virtual: boolean; scrollTop: number; scrollHeight: number; clientHeight: number; busy: boolean
}
export type HandoffDomCommand =
  | { type: 'read' }
  | { type: 'scroll'; token: string; top: number }
  | { type: 'restore'; token: string; top: number }
  | { type: 'prepare' | 'send'; prompt: string; expected: {url:string; branch:string; messages: readonly ChatMessage[]} }

/** Self-contained: this function is serialized into the existing website guest. */
function runHandoffDom(doc: Document, command: HandoffDomCommand): HandoffDomFrame {
  const chatUrl = /^https:\/\/chat\.deepseek\.com\/a\/chat\/s\/[A-Za-z0-9_-]+\/?(?:[?#].*)?$/
  if (!chatUrl.test(doc.location.href)) throw new Error('当前页面不是可交接的官网对话页，请打开一个具体对话后重试。')
  const content = doc.querySelector<HTMLElement>('[data-dsh-chat-content]')
  if (!content) throw new Error('官网对话区域尚未就绪，请稍后重试。')
  const excluded = 'script,style,svg,button,[role="button"],[hidden],[aria-hidden="true"],[data-thinking],[data-think],.thinking,.ds-think-content,.ds-think-content-wrapper,[class*="thinking"],[data-dsh-chat-web-chrome]'
  const visible = (el: Element) => {
    const style = doc.defaultView!.getComputedStyle(el)
    return el.isConnected && !el.closest('[hidden],[aria-hidden="true"]') && style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0
  }
  const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(16) }
  const safeLink = (value: string | null) => {
    if (!value) return ''
    try { const url = new URL(value, doc.location.href); return /^(https?:|file:)$/.test(url.protocol) && !url.username && !url.password ? url.href.replace(/\)/g,'%29') : '' } catch { return '' }
  }
  const markdown = (root: Element): string => {
    const codeBlocks: string[] = []
    const walk = (node: Node, depth = 0): string => {
      if (node.nodeType === 3) return (node.textContent ?? '').replace(/\u00a0/g, ' ').replace(/[\\`*_\[\]<>]/g, '\\$&')
      if (node.nodeType !== 1) return ''
      const el = node as HTMLElement
      if (el.matches(excluded)) return ''
      const tag = el.tagName.toLowerCase()
      const tex = el.querySelector('annotation[encoding="application/x-tex"]')
      if (tex && (el.matches('.katex,.katex-display,math') || el.classList.contains('math'))) return `${el.matches('.katex-display') ? '\n\n$$' : '$'}${tex.textContent ?? ''}${el.matches('.katex-display') ? '$$\n\n' : '$'}`
      if (tag === 'annotation' || tag === 'annotation-xml') return ''
      if (tag === 'pre') {
        const code = el.querySelector('code') ?? el, text = code.textContent ?? ''
        const language = [...code.classList].map(value => /^language-([\w+-]+)$/.exec(value)?.[1]).find(Boolean) ?? ''
        const runs = text.match(/`+/g) ?? [], size = Math.max(3, ...runs.map(value => value.length + 1)), fence = '`'.repeat(size)
        codeBlocks.push(`${fence}${language}\n${text.replace(/\n$/,'')}\n${fence}`)
        return `\n\n\u0000${codeBlocks.length-1}\u0000\n\n`
      }
      if (tag === 'code') { const text = el.textContent ?? '', fence = '`'.repeat(Math.max(1,...(text.match(/`+/g) ?? []).map(value => value.length+1))); return `${fence}${text.includes('`') ? ' ' : ''}${text}${text.includes('`') ? ' ' : ''}${fence}` }
      if (tag === 'br') return '\n'
      if (tag === 'table') {
        const rows = [...el.querySelectorAll('tr')].map(row => [...row.children].filter(cell => /^(TH|TD)$/.test(cell.tagName)).map(cell => [...cell.childNodes].map(n => walk(n,depth)).join('').trim().replace(/\|/g,'\\|').replace(/\n/g,'<br>'))).filter(row=>row.length)
        if (!rows.length) return ''
        const width=Math.max(...rows.map(row=>row.length)), line=(row:string[])=>`| ${Array.from({length:width},(_,i)=>row[i] ?? '').join(' | ')} |`
        return `\n\n${line(rows[0])}\n${line(Array(width).fill('---'))}\n${rows.slice(1).map(line).join('\n')}\n\n`
      }
      if (tag === 'ul' || tag === 'ol') {
        const start = Number(el.getAttribute('start')) || 1
        return `\n${[...el.children].filter(child=>child.tagName==='LI').map((item,i)=>{
          const body=[...item.childNodes].map(child=>walk(child,depth+1)).join('').trim()
          return `${'  '.repeat(depth)}${tag==='ol' ? `${start+i}.` : '-'} ${body}`
        }).join('\n')}\n`
      }
      const inner = [...el.childNodes].map(child=>walk(child,depth)).join('')
      if (tag === 'a') { const href=safeLink(el.getAttribute('href'));return href ? `[${inner || href}](${href})` : inner }
      if (tag === 'img') { const href=safeLink(el.getAttribute('src')); return el.getAttribute('alt') ? (href ? `![${el.getAttribute('alt')}](${href})` : `[Image: ${el.getAttribute('alt')}]`) : '' }
      if (tag === 'strong' || tag === 'b') return `**${inner}**`
      if (tag === 'em' || tag === 'i') return `*${inner}*`
      if (tag === 'del' || tag === 's') return `~~${inner}~~`
      if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${inner.trim()}\n\n`
      if (tag === 'blockquote') return `\n\n${inner.trim().split('\n').map(line=>`> ${line}`).join('\n')}\n\n`
      if (tag === 'hr') return '\n\n---\n\n'
      return /^(p|div|section|article)$/.test(tag) ? `\n\n${inner}\n\n` : inner
    }
    // Preformatted blocks are substituted only after prose whitespace normalization.
    return walk(root).trim().replace(/\n[ \t]+\n/g,'\n\n').replace(/\n{3,}/g,'\n\n').trim().replace(/\u0000(\d+)\u0000/g,(_all,index)=>codeBlocks[Number(index)])
  }
  const controls=(within:Element)=>[...within.querySelectorAll<HTMLElement>('button,[role="button"],.ds-icon-button')].filter(visible)
  const label=(el:Element)=>[el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-tooltip'),el.textContent].filter(Boolean).join(' ').trim()
  const busy=controls(content).some(el=>/^(stop|停止)|stop generating|停止生成/i.test(label(el))) || [...content.querySelectorAll('[aria-busy="true"],[data-generation-state="generating"]')].some(el=>visible(el))
  const messages: HandoffDomMessage[]=[]
  const candidates=[...content.querySelectorAll<HTMLElement>('.fbb737a4,.ds-markdown')].filter(el=>!el.closest('[data-thinking],[data-think],.thinking,.ds-think-content,.ds-think-content-wrapper,[class*="thinking"],[role="dialog"],[role="menu"]') && visible(el))
  if(!candidates.length) {
    const rows=[...content.querySelectorAll('[data-virtual-list-item-key],[data-message-id]')].length
    throw new Error(rows
      ? `未识别到可采集的对话消息（页面结构可能已更新）：消息行 ${rows} 个。请更新插件或把此提示反馈给维护者。`
      : '当前对话没有可采集的消息；请打开一个已有对话后重试。')
  }
  for(const el of candidates) {
    if (el.parentElement?.closest('.fbb737a4,.ds-markdown')) continue
    const role=el.matches('.fbb737a4') ? 'user' : 'assistant'
    const container=el.closest<HTMLElement>('[data-virtual-list-item-key],[data-message-id]') ?? el.parentElement ?? el
    const key=container.getAttribute('data-virtual-list-item-key') ?? container.getAttribute('data-message-id') ?? el.id
    const body=markdown(el)
    const attachments=role==='user' ? [...container.querySelectorAll<HTMLElement>('[data-attachment],a[download],[data-file-name]')].map(item=>{
      const name=item.getAttribute('data-file-name') || item.getAttribute('download') || item.textContent?.trim() || 'Source attachment'
      const href=safeLink(item.getAttribute('href'));return href ? `${name} (${href})` : name
    }) : []
    const labels=controls(container).map(label)
    messages.push({id:key ? `${role}:${key}` : `${role}:dom-${hash(body)}`,stable:Boolean(key),role,markdown:body,...(attachments.length?{attachments}:{}),complete:role==='assistant' && labels.some(value=>/copy|复制/i.test(value)) && labels.some(value=>/regenerate|retry|重新生成|重试/i.test(value))})
  }
  if(messages.length>5000 || messages.reduce((sum,item)=>sum+item.markdown.length,0)>2_000_000) throw new Error('Loaded chat exceeds safe capture size; no transcript was truncated')
  // A viewport is not a branch identity: virtual rows mount and unmount while scrolling.
  const branchRows=new Map<string,string>()
  for(const el of [...content.querySelectorAll<HTMLElement>('[data-branch-id],[data-branch-index],[aria-roledescription="branch"]')].filter(visible)) {
    const row=el.closest('[data-virtual-list-item-key],[data-message-id]')
    const key=row?.getAttribute('data-virtual-list-item-key') ?? row?.getAttribute('data-message-id')
    // A pager or other control can look like a branch switch; without a message
    // row it cannot identify the source, so it is not part of the identity.
    if(!key) continue
    const value=el.getAttribute('data-branch-id') ?? el.getAttribute('data-branch-index') ?? el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''
    const previous=branchRows.get(key)
    if(previous!==undefined && previous!==value) throw new Error('同一消息出现多个分支标记，无法安全采集。')
    branchRows.set(key,value)
  }
  const branches=JSON.stringify([...branchRows])
  let scroll:HTMLElement=content
  const first=candidates[0]
  for(let el=first?.parentElement;el && content.contains(el);el=el.parentElement) if(el.scrollHeight>el.clientHeight+4 && /auto|scroll/.test(doc.defaultView!.getComputedStyle(el).overflowY)){scroll=el;break}
  if(scroll===content && !(scroll.scrollHeight>scroll.clientHeight+4)) scroll=doc.scrollingElement as HTMLElement ?? content
  if(command.type==='prepare' || command.type==='send') {
    const expectedBranches=new Map<string,string>(JSON.parse(command.expected.branch))
    if(doc.location.href!==command.expected.url || [...branchRows].some(([key,value])=>expectedBranches.get(key)!==value) || busy) throw new Error('Source changed or website is generating')
    const expected=new Map(command.expected.messages.map(item=>[item.id,item]))
    if(!messages.length || !messages.some(item=>expected.has(item.id)) || messages.some(item=>{const old=expected.get(item.id);return !old || old.markdown!==item.markdown || JSON.stringify(old.attachments ?? [])!==JSON.stringify(item.attachments ?? [])})) throw new Error('Source branch changed before summary')
    const inputs=[...content.querySelectorAll<HTMLTextAreaElement>('textarea')].filter(visible)
    if(inputs.length!==1) throw new Error('A unique website composer is unavailable')
    const input=inputs[0],composer=input.closest('form,._77cefa5,[data-composer]')
    if(!composer || input.disabled || input.readOnly || (command.type==='prepare' ? input.value.length>0 : input.value!==command.prompt)) throw new Error('Website summary requires an empty draft; prepared prompt changed')
    if([...composer.querySelectorAll<HTMLInputElement>('input[type="file"]')].some(el=>Boolean(el.files?.length)) || composer.querySelector('[data-file-id],[data-attachment],[data-upload-status],[data-file-name],.ds-chip,[class*="file-preview"],[class*="uploading"]')) throw new Error('Remove picked or pending attachments before website summary')
    const buttons=controls(composer).filter(el=>/send|发送/i.test(label(el)) || el.matches('button[type="submit"]')).filter(el=>command.type==='prepare' || (!(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled')!=='true'))
    if(buttons.length!==1) throw new Error('A unique enabled send control is unavailable')
    if(command.type==='prepare') {
    const setter=Object.getOwnPropertyDescriptor(doc.defaultView!.HTMLTextAreaElement.prototype,'value')?.set
    if(!setter) throw new Error('Website composer cannot be updated safely')
    setter.call(input,command.prompt);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))
    // Check synchronous input handlers did not replace the composer or introduce a draft.
    if(!input.isConnected || input.value!==command.prompt || !buttons[0].isConnected) throw new Error('Website composer changed; summary was not sent')
    } else buttons[0].click()
  } else if(command.type==='scroll') {
    scroll.setAttribute('data-dsh-handoff-scroll',command.token);scroll.scrollTop=command.top;scroll.dispatchEvent(new Event('scroll',{bubbles:true}))
  } else if(command.type==='restore') {
    const saved=[...doc.querySelectorAll<HTMLElement>('[data-dsh-handoff-scroll]')].find(el=>el.getAttribute('data-dsh-handoff-scroll')===command.token)
    if(saved){saved.scrollTop=command.top;saved.dispatchEvent(new Event('scroll',{bubbles:true}));saved.removeAttribute('data-dsh-handoff-scroll')}
  }
  return {url:doc.location.href,title:doc.title,branch:branches,messages,top:scroll.scrollTop<=2,bottom:scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-2,virtual:Boolean(content.querySelector('[data-virtual-list-item-key]')),scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,busy}
}

export function websiteHandoffScript(command: HandoffDomCommand): string {
  return `(${runHandoffDom.toString()})(document,${JSON.stringify(command)})`
}
