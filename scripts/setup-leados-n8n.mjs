#!/usr/bin/env node
/** Reuse the owner's authenticated n8n installation. Creates HK-only inactive workflows. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {parse} from 'dotenv';
const args=process.argv.slice(2);
const value=(flag)=>args[args.indexOf(flag)+1];
if (!args.includes('--connection-env') || !args.includes('--runtime')) throw new Error('Use --connection-env with the existing Salman OS connection and --runtime with a private writable folder.');
const runtime=resolve(value('--runtime'));
const searchUrl=args.includes('--windows-bridge') ? 'http://127.0.0.1:8891/search' : 'http://hk-leados-research-gateway-1:8890/search';
const connection=parse(readFileSync(resolve(value('--connection-env'))));
const local=parse(readFileSync('.env.local'));
const url=(connection.N8N_URL || '').replace(/\/$/,'');
if (!url || !connection.N8N_API_KEY) throw new Error('Existing n8n connection unavailable.');
const api=async(path,body,method)=>{
 const res=await fetch(`${url}/api/v1${path}`,{method:method || (body?'POST':'GET'),headers:{'X-N8N-API-KEY':connection.N8N_API_KEY,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw new Error(`n8n ${path.split('?')[0]} HTTP ${res.status}`);
 return res.json();
};
const credentials=await api('/credentials');
const existing=Array.isArray(credentials)?credentials:credentials.data || [];
async function credential(name,token){
 if(!token || token.length<32)throw new Error(`Private token missing for ${name}`);
 const found=existing.find((c)=>c.name===name && c.type==='httpHeaderAuth');
 if(found)return {id:found.id,name:found.name};
 const c=await api('/credentials',{name,type:'httpHeaderAuth',data:{name:'Authorization',value:`Bearer ${token}`}});
 return {id:c.id,name:c.name};
}
const worker=await credential('HK LeadOS Research Worker',local.LEADOS_RESEARCH_WORKER_TOKEN);
const search=await credential('HK LeadOS Private Search',readFileSync(join(runtime,'research-token.txt'),'utf8').trim());
const dispatch=await credential('HK LeadOS Approved Dispatch',local.LEADOS_N8N_TOKEN);
const events=await credential('HK LeadOS Delivery Events',local.LEADOS_EVENT_TOKEN);
const node=(name,type,parameters,position,typeVersion=1,extra={})=>({id:name.replaceAll(' ','-'),name,type,parameters,position,typeVersion,...extra});
const headerAuth=(c)=>({httpHeaderAuth:c});
const researchNodes=[
 node('Every 20 seconds','n8n-nodes-base.scheduleTrigger',{rule:{interval:[{field:'seconds',secondsInterval:20}]}},[0,0],1.2),
 node('Claim research','n8n-nodes-base.httpRequest',{url:'https://himalayankoh.com/api/leados/research-worker',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{timeout:15000}},[240,0],4.2,{credentials:headerAuth(worker),onError:'stopWorkflow'}),
 node('Job available','n8n-nodes-base.code',{jsCode:'const j=$input.first().json.job; return j ? [{json:j}] : [];'},[460,0],2),
 node('Expand bounded queries','n8n-nodes-base.code',{jsCode:'const job=$input.first().json; const queries=[job.query]; if(job.searchDepth===2)queries.push(job.query+" wholesale supplier"); return queries.map(query=>({json:{...job,query}}));'},[570,0],2),
 node('Private SearXNG','n8n-nodes-base.httpRequest',{url:searchUrl,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendQuery:true,queryParameters:{parameters:[{name:'q',value:'={{ $json.query }}'},{name:'format',value:'json'},{name:'language',value:'en-US'},{name:'safesearch',value:'1'}]},options:{timeout:45000,response:{response:{fullResponse:true,neverError:true,responseFormat:'json'}}}},[690,0],4.2,{credentials:headerAuth(search),onError:'continueRegularOutput'}),
 node('Source result','n8n-nodes-base.code',{jsCode:`const job=$('Job available').first().json; const results=[],errors=[]; let succeeded=0; for(const response of $input.all()){const data=response.json.body || response.json;if(Array.isArray(data.results)){succeeded++;results.push(...data.results);errors.push(...(data.unresponsive_engines||[]).map(x=>JSON.stringify(x)));}else errors.push('Private SearXNG query failed or returned non-JSON data.');} return [{json:{id:job.id,claimToken:job.claimToken,results:results.slice(0,100),upstreamErrors:errors.slice(0,10),error:succeeded?'':'Private SearXNG failed or returned non-JSON results.'}}];`},[920,0],2),
 node('Store evidence','n8n-nodes-base.httpRequest',{method:'POST',url:'https://himalayankoh.com/api/leados/research-worker',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json) }}',options:{timeout:15000}},[1160,0],4.2,{credentials:headerAuth(worker)}),
];
const linear=(names)=>Object.fromEntries(names.slice(0,-1).map((name,i)=>[name,{main:[[{node:names[i+1],type:'main',index:0}]]}]));
const research={name:'HK LeadOS 2 — Private Research Worker',nodes:researchNodes,connections:linear(researchNodes.map((n)=>n.name)),settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'all',executionTimeout:110}};
const sendNodes=[
 node('Approved dispatch','n8n-nodes-base.webhook',{httpMethod:'POST',path:'hk-leados-approved-dispatch',authentication:'headerAuth',responseMode:'responseNode',options:{}},[0,0],2,{credentials:headerAuth(dispatch),webhookId:'hk-leados-approved-dispatch'}),
 node('Sender controls','n8n-nodes-base.code',{jsCode:`const request=$input.first().json.body || {}; const controls={enabled:false,senderVerified:false,optOutVerified:false,senderEmail:'',postalAddress:''}; return [{json:{request,controls}}];`},[240,0],2),
 node('Validate reviewed send','n8n-nodes-base.code',{jsCode:`const {request:r,controls:c}=$input.first().json; const allowed=c.enabled && c.senderVerified && c.optOutVerified && c.senderEmail && c.postalAddress && r.dispatchId && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(r.recipient||'') && r.subject && r.message && r.sender===c.senderEmail && r.postalAddress===c.postalAddress; return [{json:{...r,allowed:Boolean(allowed),error:allowed?'':'Sender verification, postal address and opt-out controls are not configured.'}}];`},[480,0],2),
 node('Sender ready','n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,typeValidation:'strict'},conditions:[{leftValue:'={{ $json.allowed }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'}},[700,0],2.2),
 node('Blocked response','n8n-nodes-base.respondToWebhook',{respondWith:'json',responseBody:'={{ JSON.stringify({ok:false,state:"blocked",error:$json.error}) }}',options:{responseCode:503}},[920,200],1.4),
 node('Claim once before SMTP','n8n-nodes-base.httpRequest',{method:'POST',url:'https://himalayankoh.com/api/leados/outreach-events',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({dispatchId:$json.dispatchId,eventId:$json.dispatchId+":smtp-claim",state:"sending"}) }}',options:{timeout:15000}},[920,-100],4.2,{credentials:headerAuth(events)}),
 node('Claim accepted','n8n-nodes-base.code',{jsCode:`const r=$input.first().json; if(!r.ok || r.data?.duplicate || r.data?.item?.state!=='sending')return []; const input=$('Validate reviewed send').first().json; const item=r.data.item,p=item.payload; if(item.id!==input.dispatchId || p.recipient!==input.recipient || p.subject!==input.subject || p.message!==input.message)throw new Error('Dispatch differs from the owner-approved record; no email sent.'); return [{json:{...input,recipient:p.recipient,subject:p.subject,message:p.message}}];`},[1160,-100],2),
 node('Send reviewed SMTP','n8n-nodes-base.emailSend',{fromEmail:'={{ $json.sender }}',toEmail:'={{ $json.recipient }}',subject:'={{ $json.subject }}',emailFormat:'text',text:'={{ $json.message + "\\n\\n" + $json.postalAddress }}',options:{}},[1380,-100],2.1,{retryOnFail:false}),
 node('Record sent acceptance','n8n-nodes-base.httpRequest',{method:'POST',url:'https://himalayankoh.com/api/leados/outreach-events',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({dispatchId:$("Claim accepted").first().json.dispatchId,eventId:$("Claim accepted").first().json.dispatchId+":smtp-sent",state:"sent"}) }}',options:{timeout:15000}},[1610,-100],4.2,{credentials:headerAuth(events)}),
 node('Accepted response','n8n-nodes-base.respondToWebhook',{respondWith:'json',responseBody:'{"ok":true,"state":"sent"}',options:{responseCode:202}},[1840,-100],1.4),
];
const sendConnections=linear(['Approved dispatch','Sender controls','Validate reviewed send','Sender ready']);
sendConnections['Sender ready']={main:[[{node:'Claim once before SMTP',type:'main',index:0}],[{node:'Blocked response',type:'main',index:0}]]};
Object.assign(sendConnections,linear(['Claim once before SMTP','Claim accepted','Send reviewed SMTP','Record sent acceptance','Accepted response']));
const send={name:'HK LeadOS 2 — Approved Outreach (Disabled)',nodes:sendNodes,connections:sendConnections,settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'all',executionTimeout:90}};
const workflows=await api('/workflows?limit=100');
const result=[];
for(const workflow of [research,send]){
 const found=(workflows.data || []).find((w)=>w.name===workflow.name);
 if(found?.active && args.includes('--update'))throw new Error('Deactivate the HK workflow before applying an explicit update.');
 const created=found ? (args.includes('--update') ? await api(`/workflows/${found.id}`,workflow,'PUT') : found) : await api('/workflows',workflow);
 const verified=await api(`/workflows/${created.id}`);
 result.push({id:created.id,name:created.name,active:verified.active,nodeCount:verified.nodes.length});
}
mkdirSync(runtime,{recursive:true});writeFileSync(join(runtime,'n8n-installation.json'),JSON.stringify({workflows:result},null,2));
// Credential IDs are references, never credential values; omit them from reusable templates.
for(const [file,workflow] of [['n8n-research.json',research],['n8n-outreach.json',send]]){
 const copy=structuredClone(workflow);for(const n of copy.nodes)if(n.credentials)delete n.credentials;
 writeFileSync(join('ops/leados',file),JSON.stringify(copy,null,2)+'\n');
}
console.log(JSON.stringify({workflows:result,outboundEnabled:false}));
