import { createRoot } from 'react-dom/client'
import { createHandoffWorkflow } from '../../src/handoff-client.js'
import { handoffDraftText } from '../../src/handoff-session.js'
import { DshChatHandoffDialog, DshChatHandoffInsertion } from '../../src/handoff-ui.js'
import type { ChatTranscript } from '../../src/handoff-types.js'

const transcript:ChatTranscript={id:'fictional',sourceUrl:'https://chat.deepseek.com/a/chat/s/fictional',title:'Fictional source',capturedAt:1,branchSignature:'fixture',scope:'loaded',scopeNote:'Fictional loaded range',messages:[{id:'u',role:'user',markdown:'FULL_TRANSCRIPT_SENTINEL'},{id:'a',role:'assistant',markdown:'Fictional answer'}]}
const events:string[]=[]
const directory='D:/fictional project'
const exported={directory,filePath:`${directory}/.dsh/chat-handoffs/fixture/transcript.md`}
let draft='keep selected text',attachments=['existing-attachment'],revision=1
const website={capture:async()=>transcript,validate:async()=>{},watchSource:()=>()=>{},summarize:async()=>{events.push('web-summary');return 'Fictional brief'}}
const controller=createHandoffWorkflow({
  getWebsite:()=>website,
  options:async()=>({workspaces:[{id:'w',label:'Fictional workspace',directory}],sessions:[{id:'s',label:'Existing draft',directory}]}),
  models:async()=>{events.push('models');return[{provider:'fixture-provider',model:'fixture-model',label:'Fictional model'}]},summarize:async()=>{events.push('api-summary');return 'Fictional brief'},
  exportTranscript:async()=>{events.push('export');return exported},
  deliver:async(target,_file,brief)=>{events.push('deliver');if(target.kind==='session')return{sessionId:'s',protected:true};draft=handoffDraftText(brief,exported);return{sessionId:'new',protected:false}},
  onHarness:()=>{events.push('harness')},
})
controller.setAvailable(true)
const inputActions={
  captureInsertion:()=>({start:5,end:13,revision}),
  insertText:(text:string,span:{start:number;end:number;revision:number})=>{
    if(span.revision!==revision)return false
    draft=draft.slice(0,span.start)+text+draft.slice(span.end);revision++;events.push(`insert:${span.start}:${span.end}`);return true
  },
}
function App(){return <><button onClick={()=>{void controller.open()}}>Open handoff</button><DshChatHandoffDialog controller={controller}/><DshChatHandoffInsertion controller={controller} sessionId={'s' as never} inputActions={inputActions as never} useInput={(selector:Function)=>selector({phase:'plain'})}/></>}
createRoot(document.querySelector('#root')!).render(<App/>);
(window as any).handoffFixture={snapshot:()=>({state:controller.getSnapshot(),events,draft,attachments}),resetDraft:()=>{draft='keep selected text';attachments=['existing-attachment'];revision++}}
