import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';
test.use({ channel: process.env['THSV_TEST_BROWSER_CHANNEL'] });
test('redemption cards fit all four OBS sizes and show real platform identity', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const html = await readFile('overlays/browser/addon-host.html','utf8');
  await page.route(/\/overlay\/addons\/thsv\.[a-z-]+\?/,route=>route.fulfill({contentType:'text/html',body:html}));
  await page.addInitScript(() => {
    Object.defineProperty(globalThis,'SharedWorker',{value:undefined,configurable:true});
    class Socket extends EventTarget { static OPEN=1; readyState=1; constructor(){super();(window as unknown as { publish: (payload: unknown) => void }).publish=(payload:unknown)=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(payload)}));queueMicrotask(()=>this.dispatchEvent(new Event('open')));} send(){} close(){} }
    Object.defineProperty(globalThis,'WebSocket',{value:Socket,configurable:true});
  });
  const variants=[['compact','horizontal',700,410],['regular','horizontal',980,574],['compact','vertical',410,700],['regular','vertical',574,980]] as const;
  const cards=[
    {id:'thsv.first-five',selector:'.first-five-board',payload:{cardKind:'first-five',platform:'facebook',placements:[{position:1,displayName:'A Village Viewer With A Longer Name',platform:'facebook'}],durationMs:30000}},
    {id:'thsv.fan-crown',selector:'.fan-crown-card',payload:{cardKind:'fan-crown',state:'held',holder:{displayName:'Village Champion',platform:'kick',captures:12,claimedAt:new Date().toISOString()},currentCost:1500,durationMs:30000}},
    {id:'thsv.village-roll-call',selector:'.roll-call-board',payload:{cardKind:'village-roll-call',platform:'tiktok',leaders:[{rank:1,displayName:'Village Champion',count:20},{rank:2,displayName:'Early Bird',count:15},{rank:3,displayName:'Night Owl',count:10},{rank:4,displayName:'Cozy Sloth',count:8},{rank:5,displayName:'Long Name Villager',count:5}],durationMs:30000}},
    {id:'thsv.viewer-spotlight',selector:'.spotlight-front',payload:{cardKind:'viewer-spotlight',platform:'youtube',front:{displayName:'Village Champion',platformLabel:'YouTube',viewerType:'Villager'},stats:[{label:'Village Points',value:'1,000'},{label:'Level',value:'10'},{label:'Latest achievement',value:'First Steps'}],flipToStats:false,durationMs:30000}},
    {id:'thsv.chat-play-pack',selector:'.chat-play-winner-card',payload:{cardKind:'chat-play-winner',winner:{platform:'twitch',displayName:'Village Champion'},gameName:'Trivia',points:25,durationMs:30000}},
  ];
  for(const [size,orientation,width,height] of variants)for(const card of cards){
    await page.setViewportSize({width,height}); await page.goto(`/overlay/addons/${card.id}?cardSize=${size}&cardOrientation=${orientation}`);
    await page.evaluate(({id,payload})=>{ (window as unknown as { publish: (payload: unknown) => void }).publish({contractVersion:'thsv-addon-overlay-v1',kind:'addon.publish',moduleId:id,topic:id+'.card.show',payload}); },{id:card.id,payload:card.payload});
    const frame=page.locator(card.selector);await expect(frame).toBeVisible();await page.waitForTimeout(500);
    const bounds=await frame.boundingBox();expect(bounds?.x).toBeCloseTo(0,0);expect(bounds?.y).toBeCloseTo(0,0);expect(bounds?.width).toBeCloseTo(width,0);expect(bounds?.height).toBeCloseTo(height,0);
    const overflow=await frame.evaluate(el=>el.scrollHeight-el.clientHeight);expect(overflow,`${card.id} ${size} ${orientation} vertical clipping`).toBeLessThanOrEqual(2);
    if(card.id==='thsv.first-five')await expect(page.locator('#first-five-title')).toHaveText('Facebook First Five');
    if(card.id==='thsv.chat-play-pack'){await expect(page.locator('#chat-play-winner-name')).toHaveText('Village Champion');await expect(page.locator('#chat-play-winner-points')).toHaveText('+25');}
    await page.screenshot({path:testInfo.outputPath(`${card.id}-${size}-${orientation}.png`)});
  }
});
