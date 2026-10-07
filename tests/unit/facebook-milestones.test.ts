import { describe, expect, it } from 'vitest';
import { advanceFacebookMilestone, facebookMilestoneEvent } from '../../bridge/adapters/facebook-milestones.js';
import { alertPresentationSchema } from '../../schemas/config.js';
import { normalizedEventSchema } from '../../schemas/event.js';
import { projectBrowserOverlayEvents } from '../../bridge/core/browser-overlay.js';
describe('Facebook milestones',()=>{
  it('baselines totals without replaying historical milestones',()=>{expect(advanceFacebookMilestone(undefined,95,10,true)).toEqual({highWater:95});});
  it('collapses a burst into one aggregate milestone',()=>{expect(advanceFacebookMilestone(95,125,10,false)).toEqual({highWater:125,milestone:120});});
  it('does not reannounce totals after unfollows and refollows',()=>{expect(advanceFacebookMilestone(125,90,10,false)).toEqual({highWater:125});expect(advanceFacebookMilestone(125,125,10,false)).toEqual({highWater:125});});
  it('uses the themed alert projection without inventing a follower identity',()=>{const event=facebookMilestoneEvent('123','Page','followers',100);expect(normalizedEventSchema.safeParse(event).success).toBe(true);expect(event.user).toBeUndefined();expect(projectBrowserOverlayEvents({...event,metadata:{...event.metadata,bridgeSequence:1}}).some(item=>item.kind==='alert.show')).toBe(true);});
  it('permits Facebook milestones and rejects unsupported named follows',()=>{expect(alertPresentationSchema.safeParse({profiles:{facebook:{milestone:{enabled:true}}}}).success).toBe(true);expect(alertPresentationSchema.safeParse({profiles:{facebook:{follow:{enabled:true}}}}).success).toBe(false);});
});
