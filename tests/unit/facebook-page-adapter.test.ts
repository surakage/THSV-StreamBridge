import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FacebookPageAdapter, normalizeFacebookComment } from '../../bridge/adapters/facebook-page-adapter.js';
import { normalizedEventSchema } from '../../schemas/event.js';
import { projectBrowserOverlayEvents } from '../../bridge/core/browser-overlay.js';

const roots: string[] = [];
const adapters: FacebookPageAdapter[] = [];
afterEach(async()=>{for(const adapter of adapters.splice(0))await adapter.stop();vi.useRealTimers();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
const protector = { protect: async(value:string)=>Buffer.from(value).toString('base64'), unprotect: async(value:string)=>Buffer.from(value,'base64').toString() };
const logger = { info:vi.fn(),warn:vi.fn(),error:vi.fn(),debug:vi.fn() };
async function create(fetcher:typeof fetch){const root=await mkdtemp(join(tmpdir(),'thsv-facebook-'));roots.push(root);const adapter=new FacebookPageAdapter(root,protector,fetcher);adapters.push(adapter);return{root,adapter};}
function requestUrl(input: Parameters<typeof fetch>[0]): string { return input instanceof Request ? input.url : input instanceof URL ? input.href : input; }
const token='test-private-token-never-returned';

describe('Facebook Page comments',()=>{
  it('emits a stable broadcast identity, title and associated video link for Facebook live notifications',async()=>{
    vi.useFakeTimers(); let isLive=true;
    const fetcher=vi.fn<typeof fetch>(async(url)=>Response.json(requestUrl(url).includes('/comments')?{data:[]}:requestUrl(url).includes('/live_videos')?{data:isLive?[{id:'456',status:'LIVE',title:'Village live',video:{id:'789'}}]:[]}:{id:'123',name:'Page'}));
    const {adapter}=await create(fetcher); const emit=vi.fn(async(event: unknown)=>{void event;});
    await adapter.start({logger,emit});await adapter.configure({pageId:'123',token,enabled:true});
    await vi.advanceTimersByTimeAsync(1);await Reflect.get(adapter,'pending');
    const online=emit.mock.calls.map(c=>c[0]).find(e=>(e as {eventType:string}).eventType==='stream.online');
    expect(online).toMatchObject({platform:'facebook',payload:{streamId:'456',title:'Village live',videoId:'789',streamUrl:'https://www.facebook.com/watch/?v=789'}});
    expect(normalizedEventSchema.safeParse(online).success).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);await Reflect.get(adapter,'pending');
    expect(emit.mock.calls.filter(c=>(c[0] as {eventType:string}).eventType==='stream.online')).toHaveLength(1);
    isLive=false;for(let i=0;i<7;i++){await vi.advanceTimersByTimeAsync(5000);await Reflect.get(adapter,'pending');}
    expect(emit.mock.calls.map(c=>c[0]).find(e=>(e as {eventType:string}).eventType==='stream.offline')).toMatchObject({payload:{streamId:'456'}});
  });
  it('avoids repeated broadcast discovery while continuing five-second chat reads', async()=>{
    vi.useFakeTimers();
    const fetcher=vi.fn<typeof fetch>(async(url)=>Response.json(requestUrl(url).includes('/comments')?{data:[]}:requestUrl(url).includes('/live_videos')?{data:[{id:'456',status:'LIVE'}]}:{id:'123',name:'Page'}));
    const {adapter}=await create(fetcher);await adapter.start({logger,emit:async()=>{}});await adapter.configure({pageId:'123',token,enabled:true});
    await vi.advanceTimersByTimeAsync(1);await Reflect.get(adapter,'pending');fetcher.mockClear();
    for(let i=0;i<4;i++){await vi.advanceTimersByTimeAsync(5000);await Reflect.get(adapter,'pending');}
    expect(fetcher.mock.calls.filter(([url])=>requestUrl(url).includes('/live_videos'))).toHaveLength(0);
    expect(fetcher.mock.calls.filter(([url])=>requestUrl(url).includes('/comments'))).toHaveLength(4);
  });
  it('reports safe Graph codes without retaining provider text or credentials', async()=>{
    const {adapter}=await create(async()=>Response.json({error:{code:4,error_subcode:99,message:token}},{status:403}));
    await expect(adapter.configure({pageId:'123',token})).rejects.toThrow('HTTP 403; Graph code 4, subcode 99');
    expect(JSON.stringify(adapter.status())).not.toContain(token);
  });
  it('uses the existing chat projection without inventing roles or reward support',()=>{
    const event=normalizeFacebookComment({id:'comment_1',message:'Hello village',from:{id:'42',name:'Viewer'}},'123','Page','456');
    expect(normalizedEventSchema.safeParse(event).success).toBe(true);
    const projected=projectBrowserOverlayEvents({...event,metadata:{...event.metadata,bridgeSequence:1}});
    expect(projected[0]).toMatchObject({kind:'chat.add',payload:{platform:'facebook',message:'Hello village'}});
    expect(event.user?.roles).toEqual([]);
    expect(event.eventId).toBe(normalizeFacebookComment({id:'comment_1',message:'Edited'},'123','Page','456').eventId);
  });

  it('keeps the token out of status and request URLs, and saves disabled by default',async()=>{
    const fetcher=vi.fn<typeof fetch>(async(url,options)=>{
      expect(requestUrl(url)).not.toContain(token);
      expect(options?.headers).toEqual({authorization:`Bearer ${token}`});
      return Response.json(requestUrl(url).includes('live_videos')?{data:[]}:{id:'123',name:'Page'});
    });
    const {adapter,root}=await create(fetcher);
    await adapter.start({logger,emit:async()=>undefined});
    const status=await adapter.configure({pageId:'page-name',token});
    expect(status).toMatchObject({configured:true,enabled:false,pageId:'123',verification:'unverified'});
    expect(JSON.stringify(status)).not.toContain(token);
    expect(await readFile(join(root,'secrets','facebook-page.json'),'utf8')).not.toContain(token);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('baselines old comments and delivers each new comment only once',async()=>{
    vi.useFakeTimers();let comments=[{id:'old',message:'!old-command',from:{id:'1',name:'Old'}}];
    const fetcher=vi.fn<typeof fetch>(async(url)=>Response.json(requestUrl(url).includes('/comments')?{data:comments}:requestUrl(url).includes('/live_videos')?{data:[{id:'456',status:'LIVE'}]}:{id:'123',name:'Page'}));
    const {adapter}=await create(fetcher);const emit=vi.fn(async(event: unknown)=>{void event;});const chatCount=()=>emit.mock.calls.filter(call=>(call[0] as {eventType:string}).eventType==='chat.message').length;
    await adapter.start({logger,emit});await adapter.configure({pageId:'123',token,enabled:true});
    await vi.advanceTimersByTimeAsync(1);await Reflect.get(adapter,'pending');expect(chatCount()).toBe(0);
    comments=[{id:'new',message:'Hello',from:{id:'2',name:'New'}},...comments];
    await vi.advanceTimersByTimeAsync(5000);await Reflect.get(adapter,'pending');expect(chatCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);await Reflect.get(adapter,'pending');expect(chatCount()).toBe(1);
    expect(adapter.status()).toMatchObject({state:'connected',received:1});
    await adapter.setEnabled({enabled:false});await vi.advanceTimersByTimeAsync(10000);expect(chatCount()).toBe(1);
  });

  it('shows a sanitized authorization failure without persisting a failed connection',async()=>{
    const {adapter}=await create(async()=>Response.json({error:{code:190,message:`Provider echoed ${token}`}},{status:400}));
    await expect(adapter.configure({pageId:'123',token})).rejects.toThrow('authorization expired');
    expect(JSON.stringify(adapter.status())).not.toContain(token);
    expect(adapter.status().configured).toBe(false);
  });

  it('publishes only when opted in and exactly one broadcast is live',async()=>{
    let live: Array<{id:string;status:string;video?:{id:string}}> = [];
    const fetcher=vi.fn<typeof fetch>(async(url,options)=>{
      if(options?.method==='POST'){expect(requestUrl(url)).toContain('/654/comments');expect(options.body).toBeInstanceOf(URLSearchParams);expect((options.body as URLSearchParams).toString()).toBe('message=Hello+village');return Response.json({id:'posted-comment'});}
      return Response.json(requestUrl(url).includes('/live_videos')?{data:live}:{id:'123',name:'Page'});
    });
    const {adapter}=await create(fetcher);await adapter.configure({pageId:'123',token,enabled:true});
    await expect(adapter.postTimedComment('Hello village')).rejects.toThrow('Enable Facebook');
    await adapter.setOutput({enabled:true});await expect(adapter.postTimedComment('Hello village')).rejects.toThrow('exactly one');
    live=[{id:'456',status:'LIVE'},{id:'789',status:'LIVE'}];await expect(adapter.postTimedComment('Hello village')).rejects.toThrow('exactly one');
    live=[{id:'456',status:'LIVE'}];await expect(adapter.postTimedComment('Hello village')).rejects.toThrow('no verified associated video');
    live=[{id:'456',status:'LIVE',video:{id:'654'}}];await adapter.postTimedComment('Hello village');
    live=[{id:'456',status:'VOD',video:{id:'654'}}];await expect(adapter.postTimedComment('Hello village')).rejects.toThrow('exactly one');
    expect(fetcher.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(1);
  });

  it('rejects URLs as Page IDs and rejects oversized responses',async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>new Response('x',{headers:{'content-length':'2000000'}}));
    const {adapter}=await create(fetcher);
    await expect(adapter.configure({pageId:'https://other.example/',token})).rejects.toThrow('Enter a Page ID');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(adapter.configure({pageId:'123',token})).rejects.toThrow('oversized response');
  });

  it('does not fall back to the broadcast ID or retry an uncertain video write',async()=>{
    const fetcher=vi.fn<typeof fetch>(async(url,options)=>{
      if(options?.method==='POST')return Response.json({error:{code:4}},{status:503});
      if(requestUrl(url).includes('/live_videos'))return Response.json({data:[{id:'456',status:'LIVE',video:{id:'654'}}]});
      return Response.json({id:'123',name:'Page'});
    });
    const {adapter}=await create(fetcher);await adapter.configure({pageId:'123',token,enabled:true});await adapter.setOutput({enabled:true});
    await expect(adapter.postTimedComment('Hello village')).rejects.toThrow('HTTP 503');
    const posts=fetcher.mock.calls.filter(([,options])=>options?.method==='POST');
    expect(posts).toHaveLength(1);const post=posts[0];if(!post)throw new Error('No comment POST');expect(requestUrl(post[0])).toContain('/654/comments');
    const discovery=fetcher.mock.calls.filter(([url])=>requestUrl(url).includes('/live_videos')).at(-1);
    if(!discovery)throw new Error('No broadcast discovery');
    expect(new URL(requestUrl(discovery[0])).searchParams.get('fields')).toBe('id,status,video{id}');
  });
});
