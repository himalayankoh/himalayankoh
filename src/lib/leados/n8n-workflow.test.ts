import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = JSON.parse(readFileSync(new URL('../../../ops/leados/n8n-outreach.json', import.meta.url), 'utf8'));
const code = workflow.nodes.find((node: {name:string}) => node.name === 'Claim accepted').parameters.jsCode;
const evaluate = new Function('$input', '$', code);
const input = {dispatchId:'approved-draft',recipient:'sales@example.org',subject:'Reviewed subject',message:'Reviewed copy',sender:'sales@himalayankoh.com'};
function claim(overrides = {}, duplicate = false) {
  const response = {ok:true,data:{duplicate,item:{id:input.dispatchId,state:'sending',payload:{recipient:input.recipient,subject:input.subject,message:input.message}}}};
  return evaluate({first:()=>({json:response})},()=>({first:()=>({json:{...input,...overrides}})}));
}
describe('Installed n8n transport respects the approved record', () => {
  it('accepts the exact persisted recipient and copy', () => {
    expect(claim()[0].json).toMatchObject(input);
  });
  it.each([{recipient:'other@example.org'},{subject:'Unreviewed subject'},{message:'Unreviewed copy'}])('rejects substituted dispatch fields %j', (overrides) => {
    expect(()=>claim(overrides)).toThrow('Dispatch differs');
  });
  it('stops a repeated SMTP claim before the mail node', () => {
    expect(claim({},true)).toEqual([]);
  });
});
