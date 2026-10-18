import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from 'playwright-core'

const result=await build({entryPoints:['tests/browser/handoff-ui.fixture.tsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'isolated-presentation',setup(plugin){
  plugin.onResolve({filter:/^@deepseek-ai\/dsh-client-ui-primitives$/},()=>({path:'primitives',namespace:'fixture'}))
  plugin.onLoad({filter:/.*/,namespace:'fixture'},()=>({resolveDir:process.cwd(),loader:'js',contents:`import React from 'react'; export const Button=({variant,...props})=>React.createElement('button',props); export const Modal=({open,title,description,footer,children,onClose})=>open?React.createElement('section',{role:'dialog','aria-label':title},React.createElement('h1',null,title),React.createElement('p',null,description),children,footer):null;`}))
}}]})
let browser
try{
 browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.setContent('<!doctype html><meta charset="utf-8"><div id="root"></div>');await page.addScriptTag({content:result.outputFiles[0].text})
 const snapshot=()=>page.evaluate(()=>window.handoffFixture.snapshot())
 const open=async()=>{await page.getByRole('button',{name:'Open handoff'}).click();await page.getByRole('button',{name:'采集当前分支',exact:true}).click();await page.getByText('Fictional source',{exact:true}).waitFor();await page.waitForFunction(()=>window.handoffFixture.snapshot().state.models.length>0)}
 await open()
 assert.equal(await page.getByRole('button',{name:'生成总结',exact:true}).isEnabled(),false)
 await page.getByRole('checkbox',{name:'仅交接当前已加载范围'}).check()
 await page.locator('.dsh-chat-handoff-transcript').evaluate(el=>{el.open=true})
 const turnCheck=page.getByRole('checkbox',{name:'选择第 1 轮对话'})
 assert.equal(await turnCheck.isChecked(),true)
 await turnCheck.uncheck()
 await page.getByText('已选 0/1 轮对话',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'生成总结',exact:true}).isEnabled(),false)
 await turnCheck.check()
 assert.equal(await page.getByRole('button',{name:'生成总结',exact:true}).isEnabled(),true)
 await page.getByRole('button',{name:'生成总结',exact:true}).click()
 await page.waitForFunction(()=>window.handoffFixture.snapshot().state.brief==='Fictional brief')
 assert.equal((await snapshot()).events.includes('models'),true)
 await page.getByRole('textbox',{name:'交接简报',exact:true}).fill('User edited brief')
 await page.getByRole('button',{name:'保存并打开 HARNESS 草稿'}).click()
 await page.waitForFunction(()=>window.handoffFixture.snapshot().state.phase==='done')
 let value=await snapshot();assert.match(value.draft,/User edited brief/);assert.match(value.draft,/fictional project.*transcript\.md/);assert.doesNotMatch(value.draft,/FULL_TRANSCRIPT_SENTINEL/)
 await page.evaluate(()=>window.handoffFixture.resetDraft());await open();await page.getByRole('checkbox',{name:'仅交接当前已加载范围'}).check();await page.getByRole('button',{name:'生成总结',exact:true}).click();await page.waitForFunction(()=>window.handoffFixture.snapshot().state.brief==='Fictional brief')
 await page.getByRole('combobox',{name:'交接本地目标',exact:true}).selectOption('session:s');await page.getByRole('button',{name:'保存并打开 HARNESS 草稿'}).click()
 await page.getByRole('button',{name:'在光标处插入交接'}).waitFor();value=await snapshot();assert.equal(value.draft,'keep selected text');assert.deepEqual(value.attachments,['existing-attachment'])
 await page.getByRole('button',{name:'在光标处插入交接'}).click();value=await snapshot();assert.ok(value.events.includes('insert:13:13'));assert.ok(value.draft.startsWith('keep selected'));assert.ok(value.draft.endsWith(' text'));assert.deepEqual(value.attachments,['existing-attachment']);assert.deepEqual(errors,[])
 console.log('Handoff React UI fixture: loaded-range consent, Harness model summary, editable brief, target selection, file reference, protected draft and collapsed cursor insertion: PASS (presentation and services are doubles; no real API or native guest)')
}finally{await browser?.close()}
