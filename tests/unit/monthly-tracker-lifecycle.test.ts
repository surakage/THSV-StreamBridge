import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error add-on package is JavaScript
import * as firstFiveModule from '../../addons/first-five/dist/index.js';
// @ts-expect-error add-on package is JavaScript
import * as rollCallModule from '../../addons/village-roll-call/dist/index.js';
// @ts-expect-error add-on package is JavaScript
import * as lurkTrackerModule from '../../addons/lurk-tracker/dist/index.js';

type State = Record<string, unknown>;
type Task = () => Promise<void>;
interface TrackerContext<S = State> { settings: Record<string, unknown>; state: { read: () => Promise<S>; write: (next: S) => Promise<void> }; schedule?: { after: (delay: number, task: Task) => string; cancel: () => boolean }; viewerFoundation?: { getProjection: () => Promise<{ viewerId: string }> } }
interface LifecycleModule { start: (context: TrackerContext) => Promise<void>; stop: (context: TrackerContext) => Promise<void> }
const firstFive = (firstFiveModule as { default: LifecycleModule }).default;
const rollCall = (rollCallModule as { default: LifecycleModule }).default;
const { processLurkEvent } = lurkTrackerModule as { processLurkEvent: <S>(event: Record<string, unknown>, context: TrackerContext<S>, now: number) => Promise<void> };

function monthlyContext(settings: Record<string, unknown>, initial: State) {
  let state = initial; let check: Task = async () => { throw new Error('No monthly check was scheduled.'); };
  const context: TrackerContext = { settings, state: { read: async () => state, write: async (next) => { state = structuredClone(next); } }, schedule: { after: (_delay, task) => { check = task; return 'monthly'; }, cancel: () => true } };
  return { context, check: () => check(), state: () => state };
}
afterEach(()=>vi.useRealTimers());
describe('monthly tracker lifecycle',()=>{
  it('rolls First Five rankings while preserving an in-flight native reset and current stream placements',async()=>{
    vi.useFakeTimers();vi.setSystemTime('2026-10-31T23:00:00-05:00');
    const h=monthlyContext({enabled:true,commandName:'firstfive'},{leaderboardMonth:'2026-10',leaderboard:[{userId:'youtube:viewer',displayName:'Villager',placements:[1,0,0,0,0]}],pending:{operation:'reset',requestId:'native-in-flight',startedAt:Date.now()},placements:[]});
    await firstFive.start(h.context);vi.setSystemTime('2026-11-01T00:00:30-05:00');await h.check();
    expect(h.state()).toMatchObject({leaderboardMonth:'2026-11',leaderboard:[],pending:{requestId:'native-in-flight'},placements:[]});await firstFive.stop(h.context);
  });
  it('rolls Roll Call without waiting for a stream or viewer event',async()=>{
    vi.useFakeTimers();vi.setSystemTime('2026-10-31T23:00:00-05:00');
    const h=monthlyContext({enabled:true},{month:'2026-10',entries:[{userId:'twitch:viewer',displayName:'Villager',count:5,lastDay:'2026-10-31',firstAt:'2026-10-01T12:00:00Z',lastAt:'2026-10-31T12:00:00Z'}]});
    await rollCall.start(h.context);vi.setSystemTime('2026-11-01T00:00:30-05:00');await h.check();expect(h.state()).toMatchObject({month:'2026-11',entries:[],previousWinner:{displayName:'Villager',count:5}});await rollCall.stop(h.context);
  });
  it('splits an ongoing lurk across the monthly boundary and does not invent another lurk visit',async()=>{
    interface LurkState { month?: string; entries?: Array<{ seconds: number }> }
    let state:LurkState={};const writes:LurkState[]=[];const context:TrackerContext<LurkState>={settings:{enabled:true,announceLurk:false},state:{read:async()=>state,write:async(s)=>{state=structuredClone(s);writes.push(structuredClone(s));}},viewerFoundation:{getProjection:async()=>({viewerId:'villager'})}};
    const event={eventId:'lurk',eventType:'command.received',platform:'twitch',user:{id:'1',displayName:'Villager',actorType:'human'},payload:{command:'lurk'},metadata:{simulated:false}};
    await processLurkEvent(event,context,Date.parse('2026-10-31T23:55:00-05:00'));
    await processLurkEvent({...event,eventId:'returned',eventType:'chat.message',payload:{message:'Hello!'}},context,Date.parse('2026-11-01T00:01:00-05:00'));
    expect(writes.find(s=>s.month==='2026-10'&&s.entries?.[0]?.seconds===300)).toBeDefined();expect(state).toMatchObject({month:'2026-11',entries:[{seconds:60,visits:0,since:0}]});
  });
});
