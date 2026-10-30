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

const research = JSON.parse(readFileSync(new URL('../../../ops/leados/n8n-research.json', import.meta.url), 'utf8'));
describe('Private research transport serializes expanded queries', () => {
  it.each([1, 2])('bounds depth %i and preserves the claimed job', (searchDepth) => {
    const expand = new Function('$input', research.nodes.find((node: {name:string}) => node.name === 'Expand bounded queries').parameters.jsCode);
    const items = expand({first:()=>({json:{id:'job',claimToken:'nonce',query:'feed Houston',searchDepth}})});
    expect(items).toHaveLength(searchDepth);
    expect(items.every((item: {json:{id:string;claimToken:string}})=>item.json.id==='job' && item.json.claimToken==='nonce')).toBe(true);
  });
  it('awaits each response through the loop before starting another query', () => {
    const loop = research.nodes.find((node: {name:string}) => node.name === 'Loop research queries');
    expect(loop.type).toBe('n8n-nodes-base.splitInBatches');
    expect(loop.parameters.batchSize).toBe(1);
    expect(research.connections['Expand bounded queries'].main[0][0].node).toBe(loop.name);
    expect(research.connections[loop.name].main[1][0].node).toBe('Private SearXNG');
    expect(research.connections['Private SearXNG'].main[0][0].node).toBe(loop.name);
    expect(research.connections[loop.name].main[0][0].node).toBe('Source result');
  });
  it('combines both completed responses into one nonce-bound completion', () => {
    const combine = new Function('$input', '$', research.nodes.find((node: {name:string}) => node.name === 'Source result').parameters.jsCode);
    const result = combine({all:()=>[{json:{body:{results:[{url:'https://first.example/'}]}}},{json:{body:{results:[{url:'https://second.example/'}]}}}]},()=>({first:()=>({json:{id:'job',claimToken:'nonce'}})}));
    expect(result).toHaveLength(1);
    expect(result[0].json).toMatchObject({id:'job',claimToken:'nonce',error:'',upstreamErrors:[]});
    expect(result[0].json.results).toHaveLength(2);
  });
});
