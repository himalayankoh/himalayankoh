import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const output=execFileSync(process.execPath,['../.freebuff/cf-env.mjs'],{encoding:'utf8'});
const env={...process.env};
for(const line of output.split(/\r?\n/)){const m=line.match(/^export\s+([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}
const base=`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/himalayan-koh-ecommerce`;
const res=await fetch(base+'/deployments',{headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`}});
const data=await res.json();
if(!res.ok||!data.success) throw new Error('Could not read staging deployment status: '+res.status);
const record={checkedAt:new Date().toISOString(),worker:'himalayan-koh-ecommerce',deployments:data.result};
writeFileSync(`qa-visual-artifacts/premium-upgrade/${process.argv[2]||'before'}-worker.json`,JSON.stringify(record,null,2));
console.log(JSON.stringify(record));
