#!/usr/bin/env node
/** Loopback bridge for a Windows n8n process and the private WSL search gateway. */
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const args=process.argv.slice(2),value=(name)=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
if(!args.includes('--token-file'))throw Error('Provide --token-file for the existing private research token.');
const token=readFileSync(resolve(value('--token-file')),'utf8').trim();
if(token.length<32)throw Error('Research token must have at least 32 characters.');
const script=resolve(dirname(fileURLToPath(import.meta.url)),'wsl-search.py').replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/mnt/'+drive.toLowerCase());
let running=false;
const server=createServer((req,res)=>{
 const received=(req.headers.authorization||'').replace(/^Bearer /,'');
 const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(Buffer.byteLength(received)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(received),Buffer.from(token)))return send(401,{error:'Unauthorized'});
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET'||url.pathname!=='/search')return send(404,{error:'Not found'});
 const query=(url.searchParams.get('q')||'').trim();
 if(!query||query.length>500)return send(400,{error:'A bounded public company query is required.'});
 if(running)return send(429,{error:'Research bridge is busy; retry later.'});
 running=true;
 // No shell, secret argument, arbitrary executable or arbitrary destination URL.
 const child=spawn('wsl.exe',['-d',value('--distro')||'Ubuntu-24.04','--','python3',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stdin.end(JSON.stringify({query,token}));
 let output='',finished=false;
 const finish=(code,data)=>{if(finished)return;finished=true;running=false;clearTimeout(timer);if(!res.destroyed)send(code,data);};
 const timer=setTimeout(()=>{child.kill();finish(504,{error:'Private search timed out.'});},50000);
 child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>1000000){child.kill();finish(502,{error:'Search response exceeds the limit.'});}});
 child.stderr.resume();
 child.on('error',()=>finish(502,{error:'WSL research bridge unavailable.'}));
 child.on('close',code=>{try{const data=JSON.parse(output);finish(code===0&&Array.isArray(data.results)?200:502,data);}catch{finish(502,{error:'Private search returned invalid data.'});}});
});
server.listen(8891,'127.0.0.1',()=>process.stdout.write('LeadOS search bridge listening on 127.0.0.1:8891\n'));
