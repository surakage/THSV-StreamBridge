import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { FacebookTimedOutput } from '../../bridge/adapters/facebook-timed-output.js';
import type { FacebookPageAdapter } from '../../bridge/adapters/facebook-page-adapter.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NormalizedEvent } from '../../schemas/event.js';
describe('Facebook timed output',()=>{
  it('never posts simulations, collapses retries, and refuses stale timers',async()=>{
    const root=await mkdtemp(join(tmpdir(),'fb-output-'));
    try {
      const event=JSON.parse(await readFile('tests/fixtures/system-timed-message-output.json','utf8')) as NormalizedEvent;
      event.payload['deliveryPlatforms']=['facebook'];event.payload['firedAt']=new Date().toISOString();event.payload['scheduledAt']=event.payload['firedAt'];event.metadata.simulated=false;
      const post=vi.fn(async()=>undefined);
      const facebook={postTimedComment:post,status:()=>({enabled:true,outputEnabled:true})} as unknown as FacebookPageAdapter;
      const output=new FacebookTimedOutput(facebook,root,false);await output.start();
      await output.deliver({...event,metadata:{...event.metadata,simulated:true}});expect(post).not.toHaveBeenCalled();
      await output.deliver(event);await output.deliver(event);expect(post).toHaveBeenCalledTimes(1);
      await output.deliver({...event,eventId:'platform-specific',payload:{...event.payload,selectionMode:'platform-shuffle',selectedMessage:'Twitch-only Prime reminder',selectedMessages:{twitch:'Twitch-only Prime reminder',facebook:'Follow our Facebook Page!'}}});
      expect(post).toHaveBeenLastCalledWith('Follow our Facebook Page!');post.mockClear();
      const restarted=new FacebookTimedOutput(facebook,root,false);await restarted.start();await restarted.deliver(event);expect(post).not.toHaveBeenCalled();
      await output.deliver({...event,eventId:'stale',payload:{...event.payload,firedAt:new Date(Date.now()-180000).toISOString()}});expect(post).not.toHaveBeenCalled();
      post.mockRejectedValueOnce(new Error('Uncertain network result'));
      const uncertain={...event,eventId:'uncertain'};await expect(output.deliver(uncertain)).rejects.toThrow('Uncertain');await output.deliver(uncertain);expect(post).toHaveBeenCalledTimes(1);
    } finally { await rm(root,{recursive:true,force:true}); }
  });
});
