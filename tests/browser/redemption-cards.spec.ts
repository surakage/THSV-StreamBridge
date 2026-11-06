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

test('Viewer Spotlight is one short, non-flipping card that fits its horizontal, vertical and older card-size sources', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const html = await readFile('overlays/browser/addon-host.html','utf8');
  await page.route(/\/overlay\/addons\/thsv\.viewer-spotlight(\?|$)/,route=>route.fulfill({contentType:'text/html',body:html}));
  await page.addInitScript(() => {
    Object.defineProperty(globalThis,'SharedWorker',{value:undefined,configurable:true});
    class Socket extends EventTarget { static OPEN=1; readyState=1; constructor(){super();(window as unknown as { publish: (payload: unknown) => void }).publish=(payload:unknown)=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(payload)}));queueMicrotask(()=>this.dispatchEvent(new Event('open')));} send(){} close(){} }
    Object.defineProperty(globalThis,'WebSocket',{value:Socket,configurable:true});
  });
  const stats=[['Village Points','999,999'],['Level','999'],['Latest achievement','A Very Long Achievement Name For The Village'],['Observed sessions','9,999'],['Observed messages','99,999'],['Observed commands','99,999'],['Engagement','512']].map(([label,value])=>({label,value}));
  const payload={cardKind:'viewer-spotlight',platform:'youtube',front:{displayName:'Very Long Unicode Viewer Name 🢥 With Extra Words',platformLabel:'YouTube'},stats,durationMs:30000};
  const sources=[['horizontal',760,250,''],['vertical',410,350,'?overlayOrientation=vertical'],['compact',700,410,'?cardSize=compact'],['regular',980,574,'?cardSize=regular'],['compact-vertical',410,700,'?cardSize=compact&cardOrientation=vertical'],['regular-vertical',574,980,'?cardSize=regular&cardOrientation=vertical']] as const;
  for(const [name,width,height,query] of sources){
    await page.setViewportSize({width,height}); await page.goto(`/overlay/addons/thsv.viewer-spotlight${query}`);
    await page.evaluate((payload)=>{ (window as unknown as { publish: (payload: unknown) => void }).publish({contractVersion:'thsv-addon-overlay-v1',kind:'addon.publish',moduleId:'thsv.viewer-spotlight',topic:'thsv.viewer-spotlight.card.show',payload}); },payload);
    const face=page.locator('.spotlight-face');await expect(face).toBeVisible();await page.waitForTimeout(500);
    await expect(page.locator('.spotlight-face')).toHaveCount(1);
    await expect(page.locator('#spotlight-name')).toHaveText(payload.front.displayName);
    await expect(page.locator('#spotlight-platform')).toHaveText('YouTube');
    await expect(page.locator('#spotlight-platform')).toHaveAttribute('data-platform','youtube');
    await expect(page.locator('.spotlight-stat')).toHaveCount(6);
    const layout=await face.evaluate((element)=>{
      const bounds=element.getBoundingClientRect();
      const escaped=[...element.querySelectorAll('*')].filter((child)=>{ const box=child.getBoundingClientRect(); return box.width>0&&(box.left<bounds.left-0.5||box.top<bounds.top-0.5||box.right>bounds.right+0.5||box.bottom>bounds.bottom+0.5); }).length;
      return {inside:bounds.left>=0&&bounds.top>=0&&bounds.right<=innerWidth+0.5&&bounds.bottom<=innerHeight+0.5,overflow:element.scrollHeight-element.clientHeight,escaped,height:bounds.height,width:bounds.width};
    });
    expect(layout,`${name} fits its source`).toMatchObject({inside:true,escaped:0});
    expect(layout.overflow,`${name} vertical clipping`).toBeLessThanOrEqual(1);
    const clipped=await face.evaluate((element)=>[...element.querySelectorAll('#spotlight-name,.spotlight-stat-name,.spotlight-stat-value')].filter((text)=>text.scrollWidth>text.clientWidth+1||text.scrollHeight>text.clientHeight+1).map((text)=>text.textContent));
    expect(clipped,`${name} text is shown in full`).toEqual([]);
    if(name==='horizontal')expect(layout.height,'horizontal card stays short').toBeLessThanOrEqual(240);
    await page.screenshot({path:testInfo.outputPath(`viewer-spotlight-${name}.png`)});
  }
});
