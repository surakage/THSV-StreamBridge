import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import captions from '../../addons/accessibility-captions/dist/index.js';

function chat(actorType='human'){return{schemaVersion:'1.0.0',eventId:`chat-${actorType}`,eventType:'chat.message',platform:'kick',receivedAt:new Date().toISOString(),user:{id:'viewer',name:'Viewer',displayName:'Viewer',actorType,roles:[]},payload:{message:'Readable caption text'},metadata:{simulated:false}};}
describe('Accessibility Captions',()=>{it('publishes bounded high-contrast captions and suppresses bots by default',async()=>{const context={settings:{enabled:true,showChat:true,fontSize:42,maximumCharacters:80},overlay:{publish:vi.fn(async()=>{})}};await captions.start(context);await captions.onEvent(chat(),context);await captions.onEvent(chat('bot'),context);expect(context.overlay.publish).toHaveBeenCalledOnce();expect(context.overlay.publish).toHaveBeenCalledWith('thsv.accessibility-captions.card.show',expect.objectContaining({text:'Readable caption text',style:expect.objectContaining({fontSize:42})}));await captions.stop();});});
