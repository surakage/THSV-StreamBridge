import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error packaged modules are JavaScript
import * as firstFiveModule from '../../addons/first-five/dist/index.js';
// @ts-expect-error packaged modules are JavaScript
import * as fanCrownModule from '../../addons/fan-crown/dist/index.js';
// @ts-expect-error packaged modules are JavaScript
import * as rollCallModule from '../../addons/village-roll-call/dist/index.js';
// @ts-expect-error packaged modules are JavaScript
import * as spotlightModule from '../../addons/viewer-spotlight/dist/index.js';

interface RedemptionState { placements?: Array<{ userId: string }>; crown?: { userId: string }; entries?: Array<{ count: number }> }
type Context = ReturnType<typeof runtime>['context'];
type TestEvent = ReturnType<typeof event>;
interface EventModule { onEvent(event: TestEvent, context: Context): Promise<void> }
interface LifecycleModule { start(context: Context): Promise<void>; stop(context: Context): Promise<void> }

const firstFive = (firstFiveModule as { default: EventModule }).default;
const fanCrown = (fanCrownModule as { default: EventModule }).default;
const { processRollCallEvent } = rollCallModule as { processRollCallEvent: (event: TestEvent, context: Context) => Promise<void> };
const { default: spotlight, processViewerSpotlightEvent, resetViewerSpotlightRuntime } = spotlightModule as {
  default: LifecycleModule; processViewerSpotlightEvent: (event: TestEvent, context: Context) => Promise<void>; resetViewerSpotlightRuntime: () => void;
};

function runtime(command: string) {
  let state: RedemptionState = {};
  const chat = vi.fn(async (request: unknown) => { void request; return []; }), mutate = vi.fn(async (request: unknown) => { void request; return {}; }), publish = vi.fn(async (topic: string, payload: unknown) => { void topic; void payload; });
  return { context: { settings: { enabled:true, commandName:command, disclosureAccepted:true, resetEachStream:false }, approvedActionIds:[], state:{read:async()=>state,write:async(s:RedemptionState)=>{state=structuredClone(s);}},
    schedule:{after:()=> 'monthly-task',cancel:()=>true}, chat:{send:chat}, overlay:{publish}, streamerbot:{runApprovedAction:vi.fn()},
    viewerFoundation:{getProjection:async()=>({viewerId:'facebook-viewer',currencyName:'Leaves',points:1000,level:10}),mutate}, communityAnalytics:{getViewerProjection:async()=>({observed:true,sessions:1,counters:{messages:5,commands:1}})} },state:()=>state,chat,mutate,publish };
}
const event=(command:string,id='fb-comment')=>({eventType:'command.received',eventId:id,platform:'facebook',source:{eventId:id},payload:{command,arguments:[]},metadata:{simulated:false},user:{id:'42',name:'Villager',displayName:'Villager',actorType:'human'}});
describe('Facebook points redemption path',()=>{
  it('spends once, confirms on Facebook and preserves an independent First Five board',async()=>{
    const h=runtime('firstfive'); await firstFive.onEvent(event('firstfive'),h.context); await firstFive.onEvent(event('firstfive'),h.context);
    expect(h.mutate).toHaveBeenCalledTimes(1); expect(h.state().placements?.[0]?.userId).toBe('facebook:42');
    expect(h.chat.mock.calls[0]?.[0]).toMatchObject({sourcePlatform:'facebook',routing:'source'});
    expect(h.publish.mock.calls[0]?.[1]).toMatchObject({platform:'facebook',cardKind:'first-five'});
  });
  it('captures the Fan Crown through Facebook points and sends its confirmation to Facebook',async()=>{
    const h=runtime('fancrown'); await fanCrown.onEvent(event('fancrown'),h.context); await fanCrown.onEvent(event('fancrown'),h.context);
    expect(h.mutate).toHaveBeenCalledTimes(1); expect(h.state().crown?.userId).toBe('facebook:42'); expect(h.chat.mock.calls[0]?.[0]).toMatchObject({sourcePlatform:'facebook'});
  });
  it('checks in once per day through Facebook and sends the actual platform badge',async()=>{
    const h=runtime('checkin'); await processRollCallEvent(event('checkin','one'),h.context); await processRollCallEvent(event('checkin','two'),h.context);
    expect(h.mutate).toHaveBeenCalledTimes(1); expect(h.state().entries?.[0]?.count).toBe(1); expect(h.publish.mock.calls[0]?.[1]).toMatchObject({platform:'facebook'});
  });
  it('fills the real Spotlight card with permitted data and confirms after display',async()=>{
    resetViewerSpotlightRuntime(); const h=runtime('card'); await spotlight.start(h.context); await processViewerSpotlightEvent({...event('card','online'),eventType:'stream.online'},h.context);
    await processViewerSpotlightEvent(event('card'),h.context);
    expect(h.mutate).toHaveBeenCalledTimes(1); expect(h.publish.mock.calls[0]?.[1]).toMatchObject({cardKind:'viewer-spotlight',platform:'facebook',front:{displayName:'Villager',platformLabel:'Facebook'}});
    expect(h.chat.mock.calls[0]?.[0]).toMatchObject({sourcePlatform:'facebook'}); await spotlight.stop(h.context);
  });
});
