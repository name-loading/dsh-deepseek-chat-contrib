import assert from 'node:assert/strict'
import {readFile, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {chromium} from 'playwright-core'
const root=process.cwd(), temporary=await mkdtemp(path.join(tmpdir(),'dsh-handoff-browser-'))
let browser
try {
 await build({entryPoints:['src/website-handoff.ts'],outfile:path.join(temporary,'port.mjs'),bundle:true,format:'esm',platform:'node'})
 const {createWebsiteHandoffPort}=await import(pathToFileURL(path.join(temporary,'port.mjs')).href)
 browser=await chromium.launch({executablePath:process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 const page=await browser.newPage(); await page.route('https://chat.deepseek.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('https://chat.deepseek.com/a/chat/s/fixture')
 const html=await readFile(path.join(root,'tests/browser/handoff.html'),'utf8')
 const reset=async()=>{await page.setContent(html);return createWebsiteHandoffPort({execute:script=>page.evaluate(script),identity:()=> 'fixture-generation',lifetime:new AbortController().signal})}
 let port=await reset();let transcript=await port.capture(new AbortController().signal)
 assert.equal(transcript.messages.length,2);assert.equal(transcript.scope,'loaded');assert.equal(transcript.messages[0].markdown,'Explain **carefully**\nnext line')
 const answer=transcript.messages[1].markdown
 assert.ok(answer.includes('Literal \\*stars\\* and \\_underscores\\_ and \\[brackets\\].'.replaceAll('\\\\','\\')))
 assert.ok(answer.includes('````txt\nbefore\n```\n\n\n\n after\n````'))
 assert.match(answer,/```ts\nconst x = `code`;/);assert.match(answer,/\| A\\\|B \| 2 \|/);assert.match(answer,/\$x\^2\+1\$/);assert.match(answer,/- One\n  - Nested/);assert.match(answer,/\[docs\]\(https:\/\/example.com\/docs\)/);assert.doesNotMatch(answer,/PRIVATE THOUGHT|LOSSY|Retry/)
 assert.deepEqual(transcript.messages[0].attachments,['report.txt (file:///D:/fixtures/report.txt)'])
 await page.locator('textarea').fill('Keep my draft');await assert.rejects(port.summarize(transcript,new AbortController().signal),/draft|empty/i);assert.equal(await page.locator('textarea').inputValue(),'Keep my draft');assert.equal(await page.evaluate(()=>window.fixtureSends),0)
 port=await reset();transcript=await port.capture(new AbortController().signal);await page.locator('textarea').fill('  ');await assert.rejects(port.summarize(transcript,new AbortController().signal),/draft|empty/i);assert.equal(await page.locator('textarea').inputValue(),'  ');assert.equal(await page.evaluate(()=>window.fixtureSends),0)
 port=await reset();transcript=await port.capture(new AbortController().signal);const summary=await port.summarize(transcript,new AbortController().signal);assert.equal(summary,'Summary from fixture.');assert.equal(transcript.messages.length,2);assert.equal(await page.evaluate(()=>window.fixtureSends),1);await port.validate(transcript,new AbortController().signal)
 port=await reset();transcript=await port.capture(new AbortController().signal);await page.evaluate(()=>history.pushState({},'', '/a/chat/s/other'));await assert.rejects(port.validate(transcript,new AbortController().signal),/已变化|重新采集/);await page.evaluate(()=>history.replaceState({},'', '/a/chat/s/fixture'))
 port=await reset();transcript=await port.capture(new AbortController().signal);await page.locator('[data-virtual-list-item-key="a1"] .ds-markdown').fill('x').catch(async()=>page.locator('[data-virtual-list-item-key="a1"] .ds-markdown').evaluate(el=>el.textContent='Changed branch'));await assert.rejects(port.validate(transcript,new AbortController().signal),/分支|已变化|重新采集/)
 port=await reset();transcript=await port.capture(new AbortController().signal);await page.locator('form').evaluate(el=>{const file=document.createElement('input');file.type='file';el.append(file)});await page.locator('input[type="file"]').setInputFiles({name:'pending.txt',mimeType:'text/plain',buffer:Buffer.from('fixture')});await assert.rejects(port.summarize(transcript,new AbortController().signal),/attachment|picked|pending/i);assert.equal(await page.evaluate(()=>window.fixtureSends),0)
 port=await reset();transcript=await port.capture(new AbortController().signal);await page.locator('form').evaluate(el=>{const stop=document.createElement('button');stop.setAttribute('aria-label','Stop generating');el.append(stop)});await assert.rejects(port.summarize(transcript,new AbortController().signal),/generating/i);assert.equal(await page.evaluate(()=>window.fixtureSends),0)
 port=await reset();transcript=await port.capture(new AbortController().signal);await page.evaluate(()=>window.fixtureNeverComplete=true);const cancel=new AbortController();const timer=setTimeout(()=>cancel.abort(),900);try{await assert.rejects(port.summarize(transcript,cancel.signal),/取消/)}finally{clearTimeout(timer)};assert.equal(await page.evaluate(()=>window.fixtureSends),1);await assert.rejects(port.summarize(transcript,new AbortController().signal),/already attempted|again/i);assert.equal(await page.evaluate(()=>window.fixtureSends),1)
 const virtualHtml=await readFile(path.join(root,'tests/browser/handoff-virtual.html'),'utf8');await page.setContent(virtualHtml);port=createWebsiteHandoffPort({execute:script=>page.evaluate(script),identity:()=> 'virtual-fixture',lifetime:new AbortController().signal});transcript=await port.capture(new AbortController().signal);assert.deepEqual(transcript.messages.map(message=>message.markdown),Array.from({length:12},(_,i)=>`Message ${i}`));assert.equal(await page.locator('#history').evaluate(el=>el.scrollTop),800);assert.equal(transcript.scope,'loaded');await port.validate(transcript,new AbortController().signal)
 await page.locator('#history').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'))});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await port.validate(transcript,new AbortController().signal);await page.locator('[aria-roledescription="branch"]').evaluate(el=>el.textContent='2 / 2');await assert.rejects(port.validate(transcript,new AbortController().signal),/已变化|重新采集/)
 await page.setContent(virtualHtml);const cancelledCapture=new AbortController();port=createWebsiteHandoffPort({execute:async script=>{const value=await page.evaluate(script);if(value.scrollTop<800)cancelledCapture.abort();return value},identity:()=> 'cancelled-virtual-fixture',lifetime:new AbortController().signal});await assert.rejects(port.capture(cancelledCapture.signal),/已取消|取消|会话已结束/);assert.equal(await page.locator('#history').evaluate(el=>el.scrollTop),800)
 console.log('Handoff browser fixture: Markdown, metadata, frozen snapshot, draft guard, correlated summary and source changes passed')
} finally {await browser?.close();await rm(temporary,{recursive:true,force:true})}

// Virtualization must be tested by replacing real DOM rows while scrolling, not canned responses.
