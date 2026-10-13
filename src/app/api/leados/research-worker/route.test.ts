import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
const mocks=vi.hoisted(()=>({db:vi.fn()}));
vi.mock('@/lib/leados/db',()=>({leadosRequest:mocks.db}));
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('LEADOS_RESEARCH_WORKER_TOKEN','private-worker-test-'.repeat(3));mocks.db.mockResolvedValue({job:null});});
const request=(body?:unknown,key='private-worker-test-'.repeat(3))=>new Request('https://himalayankoh.com/api/leados/research-worker',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
describe('Least-scope private research worker',()=>{
 it('refuses unauthenticated polling without accessing the queue',async()=>{expect((await GET(request(undefined,'wrong'))).status).toBe(401);expect(mocks.db).not.toHaveBeenCalled();});
 it('can claim only discovery work, never customers or arbitrary WordPress paths',async()=>{await GET(request());expect(mocks.db).toHaveBeenCalledWith('/workflow',{method:'POST',body:{action:'claim_discovery'}});});
 it('rejects oversized or missing claims',async()=>{expect((await POST(request({id:'a',results:[]}))).status).toBe(400);expect((await POST(request({id:'a',claimToken:'b',results:Array(101).fill({})}))).status).toBe(400);expect(mocks.db).not.toHaveBeenCalled();});
 it('stores only bounded search observations, no caller-supplied email or score',async()=>{await POST(request({id:'a',claimToken:'b',results:[{title:'Feed Store',url:'https://example.org',email:'guessed@example.org',score:100}],action:'delete-orders'}));expect(mocks.db).toHaveBeenCalledWith('/workflow',{method:'POST',body:{action:'complete_discovery',id:'a',claimToken:'b',results:[{title:'Feed Store',url:'https://example.org',content:''}],error:'',upstreamErrors:[]}});});
});
