// Village Fun Commands owns lightweight, source-routed entertainment commands.
// Online content is fetched only by one approved Streamer.bot helper; the add-on itself has no network access.
const MODULE_ID = 'thsv.village-fun-commands';
const CONTENT_EVENT = 'addon.thsv.village-fun-commands.content-received';
const FETCH_ACTION_ID = '74e6fc7e-39cd-4de3-a9ad-4ed7ef049196';
const FOLLOW_AGE_ACTION_ID = '9df94d73-b90c-4eeb-8992-1a902f99cc98';
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 });
const PROVIDERS = new Set(['cat', 'joke', 'fun', 'number', 'chuck']);
const PALETTE = Object.freeze([
  ['Village Fern', '#4F8A5B'], ['Firefly Gold', '#F4C95D'], ['Moonlit Teal', '#2EC4B6'], ['Twitch Violet', '#9146FF'],
  ['YouTube Red', '#FF3B30'], ['Kick Green', '#53FC18'], ['TikTok Cyan', '#25F4EE'], ['Berry Rose', '#E85D75'],
  ['Forest Ink', '#16352A'], ['Cloud Blue', '#79B8F3'], ['Mushroom Tan', '#C7A17A'], ['Lavender Mist', '#B8A1E3'],
]);

const FALLBACKS = Object.freeze({
  sloth: Object.freeze([
    'Sloths spend most of their lives hanging upside down, and their internal organs are anchored to reduce pressure on the lungs.',
    'A sloth\'s fur grows away from its limbs toward its body, helping rain run off while it hangs upside down.',
    'Sloths are surprisingly capable swimmers and can move through water more efficiently than they move across the ground.',
    'Living sloths are grouped into two-toed and three-toed species, but those names describe the front limbs rather than every foot.',
    'Sloths have extremely slow metabolisms, an adaptation that helps them survive on a low-energy leaf diet.',
    'Algae can grow in grooves in sloth fur, adding camouflage among the green canopy.',
    'Most sloth movement happens in the forest canopy, where long curved claws provide a secure grip.',
    'A sloth\'s body temperature varies more than that of many other mammals and can shift with the surrounding conditions.',
    'Three-toed sloths have extra neck vertebrae that let some species turn their heads remarkably far.',
    'Sloths descend from the canopy infrequently, commonly about once a week, to relieve themselves.',
    'Modern tree sloths are relatives of extinct ground sloths, some of which grew much larger than today\'s species.',
    'A sloth may remain almost motionless for long periods, conserving energy and making itself harder for predators to notice.',
    'Sloth fur supports a small ecosystem that can include algae, moths, beetles, and other organisms.',
    'Baby sloths cling to their mothers and learn which foods are safe by sampling leaves from the same trees.',
    'Sloths have long arms relative to their bodies, giving them reach and stability while moving between branches.',
    'Leaves can take many days to pass through a sloth\'s complex digestive system.',
    'Sloths sleep less in the wild than early observations of captive sloths once suggested.',
    'Two-toed sloths are generally more active at night, while activity patterns can vary by species and habitat.',
    'The slow pace of a sloth is an energy-saving survival strategy, not laziness.',
    'Healthy forests are essential for sloths because roads and cleared land can isolate the connected canopy they depend on.',
  ]),
  cat: Object.freeze([
    'Cats use their whiskers to sense nearby surfaces and changes in air movement.',
    'A cat\'s nose pattern is individually distinctive, much like a human fingerprint.',
    'Cats can rotate each ear independently to help locate the source of a sound.',
    'Domestic cats share the slow blink as a relaxed social signal with familiar humans.',
    'A cat\'s rough tongue is covered with backward-facing structures that help groom fur and remove meat from food.',
    'Cats usually walk by moving the back foot into nearly the same place as the front foot on that side.',
    'Most adult cats use meowing primarily to communicate with humans rather than with other adult cats.',
    'Cats have a reflective layer behind the retina that improves vision in dim light.',
    'A cat\'s tail helps with balance and also communicates mood and intention.',
    'Cats cannot taste sweetness the way humans can because they lack a functioning sweet taste receptor.',
    'Kittens are born with closed eyes and depend heavily on scent and touch during their earliest days.',
    'Cats can make many vocal sounds, including purrs, chirps, trills, growls, and meows.',
    'A cat\'s purr can occur during relaxation, stress, pain, or self-soothing.',
    'Cats are crepuscular by nature, meaning they are often most active near dawn and dusk.',
    'The flexible spine of a cat contributes to its long stride and strong jumping ability.',
    'Cats sweat mainly through their paw pads rather than across most of their skin.',
    'A group of adult cats can be called a clowder, while a group of kittens can be called a kindle.',
    'Cats groom one another to reinforce social bonds as well as to clean hard-to-reach areas.',
    'A cat uses scent glands around its face when it rubs its cheeks against familiar objects or people.',
    'A relaxed cat may hold its tail upright with a slight curve when greeting someone it trusts.',
  ]),
  joke: Object.freeze([
    'Why did the streamer bring a ladder? The chat said the hype was through the roof.',
    'My controller asked for a break. I told it to stop pressing my buttons.',
    'Why was the loading screen calm? It had plenty of time to process everything.',
    'The microphone joined a band because it was tired of being muted.',
    'Why did the keyboard stay home? It had lost control.',
    'The webcam went to school to improve its focus.',
    'Why did the sloth become a moderator? It was slow to anger and quick to remove spam.',
    'The game map and I broke up. It kept telling me where to go.',
    'Why did the pixel apply for a job? It wanted to make a bigger picture.',
    'The headset opened a bakery because it already had great rolls.',
    'Why did the speedrunner carry a calendar? Every second counted.',
    'The save file was optimistic. It always believed there was another chance.',
    'Why did the NPC cross the road? Its pathfinding finally worked.',
    'The graphics card told a joke, but it needed a better delivery driver.',
    'Why was the stream deck popular? It always knew which buttons to push.',
    'The Wi-Fi apologized. It said the disconnect was not personal.',
    'Why did the gamer sit near the window? They wanted a better view of the open world.',
    'The patch notes started a diary because they had so many changes to process.',
    'Why did the chat message stretch? It wanted to reach the character limit.',
    'The final boss opened a café. Every order came with an extra phase.',
  ]),
  fun: Object.freeze([
    'Octopuses have three hearts and blue blood.', 'Bananas are berries in botanical terms, while strawberries are not true berries.',
    'A day on Venus lasts longer than a year on Venus.', 'Honey can remain edible for an extremely long time when sealed and stored properly.',
    'The Eiffel Tower can become slightly taller in warm weather as its metal expands.', 'Wombat droppings are cube-shaped.',
    'Sharks existed before trees appeared in the fossil record.', 'The dot above a lowercase i or j is called a tittle.',
    'Some turtles can absorb oxygen through specialized tissues near their rear end while underwater.', 'A group of flamingos can be called a flamboyance.',
    'The shortest recorded war lasted less than one hour.', 'Scotland\'s national animal is the unicorn.',
    'Sea otters may hold hands while resting so they do not drift apart.', 'The smell after rain on dry ground is called petrichor.',
    'An astronaut can grow slightly taller in space because the spine is less compressed.', 'Ravens can mimic human speech and other sounds.',
    'The fingerprints of koalas can look remarkably similar to human fingerprints.', 'Some bamboo species can grow more than half a meter in one day under ideal conditions.',
    'A cloud can weigh hundreds of thousands of kilograms even though it floats.', 'The word queue is pronounced the same even if its last four letters are removed.',
  ]),
  number: Object.freeze([
    '0 is the additive identity: adding it leaves any number unchanged.', '1 is the only positive integer that is neither prime nor composite.',
    '2 is the only even prime number.', '3 is the first odd prime number.', '4 is the smallest composite number.',
    '5 is the number of Platonic solids.', '6 is the smallest perfect number because its positive proper divisors add to 6.',
    '7 is the number of days in the modern week.', '8 is the first positive cube after 1.', '9 is the largest single-digit decimal number.',
    '10 is the base of the decimal number system.', '11 is the smallest two-digit prime number.', '12 has more positive divisors than any smaller positive integer.',
    '13 is the sixth prime number.', '14 is twice 7 and the number of lines in a traditional sonnet.', '15 is the fifth triangular number.',
    '16 is both a square and a fourth power.', '17 is the sum of the first four prime numbers.', '18 is the only positive number that is twice the sum of its decimal digits.',
    '19 is the eighth prime number.',
  ]),
  chuck: Object.freeze([
    'Chuck Norris does not need a loading screen; the level prepares before he arrives.', 'Chuck Norris can finish an endless mode.',
    'Chuck Norris once pressed Alt and F4, and the building closed.', 'Chuck Norris can divide by zero, but zero apologizes first.',
    'Chuck Norris does not miss skill checks; skill checks miss him.', 'Chuck Norris can hear a muted microphone.',
    'Chuck Norris completed the tutorial before installing the game.', 'Chuck Norris does not need fast travel; the map moves to him.',
    'Chuck Norris can pause an online match.', 'Chuck Norris found the last page of the internet.',
    'Chuck Norris can win a staring contest with a webcam.', 'Chuck Norris once rolled a seven on a six-sided die.',
    'Chuck Norris can read a corrupted save file.', 'Chuck Norris does not enter passwords; systems recognize him.',
    'Chuck Norris can speedrun a turn-based game in real time.', 'Chuck Norris can make a keyboard type quietly.',
    'Chuck Norris does not chase the meta; the meta follows him.', 'Chuck Norris can make the final boss skip its own cutscene.',
    'Chuck Norris can reconnect before the disconnect happens.', 'Chuck Norris knows what the next patch will fix.',
  ]),
});

const EIGHT_BALL = Object.freeze(['It is certain.', 'The village signs point to yes.', 'Without a doubt.', 'Most likely.', 'The outlook is good.', 'Ask again after the next checkpoint.', 'The answer is hiding in the leaves.', 'The outlook is unclear.', 'Better not count on it.', 'The village votes no.', 'Not this time.', 'Trust your instincts.']);
const manifest = {
  contractVersion:'2.0.0-preview.1', moduleId:MODULE_ID, name:'Village Fun Commands', version:'4.0.2', minimumCoreVersion:'2.0.0-preview.1', maximumTestedCoreVersion:'2.0.0-preview.1', minimumBridgeVersion: '4.0.2', maximumTestedBridgeVersion: '4.0.2', dependencies:[], requiredCapabilities:[], configurationSchema:'schemas/config.json',
  eventSubscriptions:['command.received','stream.online',CONTENT_EVENT],
  commandsProvided:[
    {id:'village-fun.sloth-fact',name:'slothfact'},{id:'village-fun.cat-fact',name:'catfact'},{id:'village-fun.joke',name:'joke'},{id:'village-fun.fun-fact',name:'funfact'},{id:'village-fun.number-fact',name:'numberfact'},{id:'village-fun.eight-ball',name:'8ball'},{id:'village-fun.hug',name:'hug'},{id:'village-fun.hugs',name:'hugs'},{id:'village-fun.timezone',name:'timezone'},{id:'village-fun.dice',name:'dice'},{id:'village-fun.pick',name:'pick'},{id:'village-fun.rate',name:'rate'},{id:'village-fun.random-color',name:'randomcolor'},{id:'village-fun.follow-age',name:'followage'},{id:'village-fun.chuck-norris',name:'chucknorris'},{id:'village-fun.aesthetic',name:'aesthetic'},
  ],
  actionsProvided:[{id:'village-fun.fetch',name:'Optional bounded fun-content provider fetch'},{id:'village-fun.follow-age-fetch',name:'Twitch follow-age lookup'}], browserSourcesProvided:[], dataStorageOwned:['data/addons/thsv.village-fun-commands/','data/addons/.state/thsv.village-fun-commands/'],
  installationSteps:['Install Village Fun Commands in the wizard.','When online providers are enabled, import and approve Fetch Fun Content; keep it triggerless.','Choose command toggles and names, save, and restart StreamBridge.','Use the existing platform chat intakes; do not create separate Streamer.bot Command objects.'],
  uninstallationSteps:['Uninstalling preserves only bounded cooldown, recent-response, and hug-count state.'], migrations:[], healthChecks:[{id:'thsv.village-fun-commands.runtime',description:'Confirms automatic fun commands, bounded provider relays, source-only replies, and offline fallbacks are available.'}],
};

let operation = Promise.resolve();
const pending = new Map();
function clean(value, maximum = 350) { return Array.from(typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/gu, ' ').trim() : '').slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const parsed = Number(value); return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback; }
function commandName(value, fallback) { const result = clean(value, 64).toLowerCase(); return /^[a-z0-9][a-z0-9-]{0,63}$/u.test(result) ? result : fallback; }
function timeZone(value) { const result=clean(value,64)||'America/Chicago';try{new Intl.DateTimeFormat('en-US',{timeZone:result}).format();return result;}catch{return'America/Chicago';} }
function list(value) { return Array.isArray(value) ? [...new Set(value.map((item) => clean(item, 350)).filter(Boolean))].slice(0, 50) : []; }
function settingsFor(context) { const raw = context.settings || {}; return {
  enabled:raw.enabled===true, useOnlineProviders:raw.useOnlineProviders!==false, avoidRecentRepeats:raw.avoidRecentRepeats!==false,
  globalCooldownSeconds:integer(raw.globalCooldownSeconds,1,300,5), viewerCooldownSeconds:integer(raw.viewerCooldownSeconds,1,3600,20),
  slothFactEnabled:raw.slothFactEnabled!==false,slothFactCommand:commandName(raw.slothFactCommand,'slothfact'),catFactEnabled:raw.catFactEnabled!==false,catFactCommand:commandName(raw.catFactCommand,'catfact'),jokeEnabled:raw.jokeEnabled!==false,jokeCommand:commandName(raw.jokeCommand,'joke'),funFactEnabled:raw.funFactEnabled!==false,funFactCommand:commandName(raw.funFactCommand,'funfact'),numberFactEnabled:raw.numberFactEnabled!==false,numberFactCommand:commandName(raw.numberFactCommand,'numberfact'),eightBallEnabled:raw.eightBallEnabled!==false,eightBallCommand:commandName(raw.eightBallCommand,'8ball'),hugEnabled:raw.hugEnabled!==false,hugCommand:commandName(raw.hugCommand,'hug'),hugsCommand:commandName(raw.hugsCommand,'hugs'),timezoneEnabled:raw.timezoneEnabled!==false,timezoneCommand:commandName(raw.timezoneCommand,'timezone'),timezoneName:timeZone(raw.timezoneName),timezoneLabel:clean(raw.timezoneLabel,50)||'Streamer time',diceEnabled:raw.diceEnabled!==false,diceCommand:commandName(raw.diceCommand,'dice'),pickEnabled:raw.pickEnabled!==false,pickCommand:commandName(raw.pickCommand,'pick'),rateEnabled:raw.rateEnabled!==false,rateCommand:commandName(raw.rateCommand,'rate'),randomColorEnabled:raw.randomColorEnabled!==false,randomColorCommand:commandName(raw.randomColorCommand,'randomcolor'),followAgeEnabled:raw.followAgeEnabled!==false,followAgeCommand:commandName(raw.followAgeCommand,'followage'),chuckNorrisEnabled:raw.chuckNorrisEnabled===true,chuckNorrisCommand:commandName(raw.chuckNorrisCommand,'chucknorris'),aestheticEnabled:raw.aestheticEnabled===true,aestheticCommand:commandName(raw.aestheticCommand,'aesthetic'),
  additions:{sloth:list(raw.additionalSlothFacts),cat:list(raw.additionalCatFacts),joke:list(raw.additionalJokes),fun:list(raw.additionalFunFacts),number:list(raw.additionalNumberFacts),chuck:list(raw.additionalChuckNorrisJokes)},
}; }
function stateFor(raw) { const value=raw&&typeof raw==='object'?raw:{}; const cooldowns=value.cooldowns&&typeof value.cooldowns==='object'?Object.fromEntries(Object.entries(value.cooldowns).filter(([,at])=>Number.isSafeInteger(at)&&at>0).sort((a,b)=>a[1]-b[1]).slice(-500)):{}; const recent=value.recent&&typeof value.recent==='object'?Object.fromEntries(Object.entries(value.recent).map(([key,items])=>[clean(key,20),Array.isArray(items)?items.map((item)=>clean(item,350)).filter(Boolean).slice(-5):[]]).filter(([key])=>key)):{}; const hugs=Array.isArray(value.hugs)?value.hugs.map((item)=>({key:clean(item?.key,100),name:clean(item?.name,50),count:integer(item?.count,1,1_000_000,1)})).filter((item)=>item.key&&item.name).sort((a,b)=>b.count-a.count).slice(0,250):[]; const providerBlockedUntil=value.providerBlockedUntil&&typeof value.providerBlockedUntil==='object'?Object.fromEntries(Object.entries(value.providerBlockedUntil).filter(([key,at])=>PROVIDERS.has(key)&&Number.isSafeInteger(at)&&at>0)):{}; return {cooldowns,recent,hugs,providerBlockedUntil,globalAt:integer(value.globalAt,0,Number.MAX_SAFE_INTEGER,0),sessionKey:clean(value.sessionKey,20)}; }
function randomIndex(length) { if(length<=1)return 0; const values=new Uint32Array(1); globalThis.crypto.getRandomValues(values); return values[0]%length; }
function poolFor(kind, settings) { return [...FALLBACKS[kind], ...(settings.additions[kind]||[])]; }
function fallback(kind, settings, state) { const pool=poolFor(kind,settings); const recent=settings.avoidRecentRepeats?(state.recent[kind]||[]):[]; const candidates=pool.filter((item)=>!recent.includes(item)); const selected=(candidates.length?candidates:pool)[randomIndex((candidates.length?candidates:pool).length)]; state.recent[kind]=[...recent,selected].slice(-5); return selected; }
function recordRecent(kind, value, settings, state) { if(!settings.avoidRecentRepeats)return true; const recent=state.recent[kind]||[]; if(recent.includes(value))return false; state.recent[kind]=[...recent,value].slice(-5); return true; }
function commandMap(settings) { return new Map([
  [settings.slothFactCommand,settings.slothFactEnabled?'sloth':undefined],[settings.catFactCommand,settings.catFactEnabled?'cat':undefined],[settings.jokeCommand,settings.jokeEnabled?'joke':undefined],[settings.funFactCommand,settings.funFactEnabled?'fun':undefined],[settings.numberFactCommand,settings.numberFactEnabled?'number':undefined],[settings.eightBallCommand,settings.eightBallEnabled?'eightball':undefined],[settings.hugCommand,settings.hugEnabled?'hug':undefined],[settings.hugsCommand,settings.hugEnabled?'hugs':undefined],[settings.timezoneCommand,settings.timezoneEnabled?'timezone':undefined],[settings.diceCommand,settings.diceEnabled?'dice':undefined],[settings.pickCommand,settings.pickEnabled?'pick':undefined],[settings.rateCommand,settings.rateEnabled?'rate':undefined],[settings.randomColorCommand,settings.randomColorEnabled?'color':undefined],[settings.followAgeCommand,settings.followAgeEnabled?'followage':undefined],[settings.chuckNorrisCommand,settings.chuckNorrisEnabled?'chuck':undefined],[settings.aestheticCommand,settings.aestheticEnabled?'aesthetic':undefined],
].filter(([,kind])=>kind)); }
function argumentsFor(event) { return Array.isArray(event.payload?.arguments)?event.payload.arguments.map((item)=>clean(item,100)).filter(Boolean).slice(0,20):[]; }
function viewerKey(event) { const id=clean(event.user?.id,180); return id?`${event.platform}:${id}`:''; }
function applyCooldown(event, kind, settings, state, now) { const key=viewerKey(event); if(!key)return false; if(now-state.globalAt<settings.globalCooldownSeconds*1000)return false; const viewerCommand=`${key}:${kind}`; if(now-(state.cooldowns[viewerCommand]||0)<settings.viewerCooldownSeconds*1000)return false; state.globalAt=now; state.cooldowns=Object.fromEntries(Object.entries({...state.cooldowns,[viewerCommand]:now}).sort((a,b)=>a[1]-b[1]).slice(-500)); return true; }
async function reply(context,event,message){const maximum=LIMITS[event.platform];if(!maximum)return;let bounded=clean(message,maximum*2);if(Array.from(bounded).length>maximum)bounded=Array.from(bounded).slice(0,maximum-1).join('').trimEnd()+'…';if(!bounded)return;await context.chat.send({message:bounded,routing:'source',sourcePlatform:event.platform,overflow:'reject'}).catch(()=>undefined);}
function providerContent(value){const result=clean(value,350);if(!result||/https?:\/\//iu.test(result)||/[<>]/u.test(result))return'';return result;}
function hash(value){let result=2166136261;for(const character of value){result^=character.codePointAt(0)||0;result=Math.imul(result,16777619);}return result>>>0;}
function aesthetic(value){const normalized=clean(value.normalize('NFKC'),80);if(!normalized||/(?:https?:\/\/|www\.|@everyone|@here)/iu.test(normalized))return'';return Array.from(normalized).map((character)=>{const code=character.codePointAt(0);if(code===32)return '　';if(code>=33&&code<=126)return String.fromCodePoint(code+0xfee0);return character;}).join('');}
function localResponse(kind,args,event,settings,state){const name=clean(event.user?.displayName||event.user?.name,50)||'Villager';
  if(kind==='sloth')return fallback('sloth',settings,state);if(kind==='eightball')return args.length?`${name}, ${EIGHT_BALL[randomIndex(EIGHT_BALL.length)]}`:`${name}, ask a complete question after !${settings.eightBallCommand}.`;
  if(kind==='dice'){const sides=args.length?Number(args[0]):6;if(!Number.isSafeInteger(sides)||sides<2||sides>1000)return`Use !${settings.diceCommand} with a number from 2 to 1000.`;return`${name} rolled ${1+randomIndex(sides)} on a ${sides}-sided die.`;}
  if(kind==='pick'){const joined=args.join(' ');const choices=joined.split(/[|,]/u).map((item)=>clean(item,60)).filter(Boolean).slice(0,10);return choices.length>=2?`The Village picks: ${choices[randomIndex(choices.length)]}`:`Use !${settings.pickCommand} option one, option two.`;}
  if(kind==='rate'){const subject=clean(args.join(' '),100);if(!subject)return`Use !${settings.rateCommand} followed by something to rate.`;const score=hash(`${state.sessionKey}:${subject.toLowerCase()}`)%101;return`The Village rates ${subject}: ${score}/100.`;}
  if(kind==='color'){const [color,hex]=PALETTE[randomIndex(PALETTE.length)];return`Random color: ${color} (${hex}).`;}
  if(kind==='aesthetic'){const converted=aesthetic(args.join(' '));return converted||`Use !${settings.aestheticCommand} followed by safe text without links.`;}
  if(kind==='hug'){const target=clean(args.join(' ').replace(/^@/u,''),50);if(!target)return`Use !${settings.hugCommand} followed by a viewer name.`;const key=`${event.platform}:${target.toLowerCase()}`;let item=state.hugs.find((entry)=>entry.key===key);if(!item){item={key,name:target,count:0};state.hugs.push(item);}item.name=target;item.count+=1;state.hugs.sort((a,b)=>b.count-a.count);state.hugs=state.hugs.slice(0,250);return`${name} sends ${target} a big Village hug! ${target} now has ${item.count} hug${item.count===1?'':'s'}.`;}
  if(kind==='hugs'){if(!state.hugs.length)return'No hugs have been recorded yet.';return`Hug leaders: ${state.hugs.slice(0,3).map((item,index)=>`#${index+1} ${item.name} (${item.count})`).join(' | ')}`;}
  if(kind==='timezone'){const formatted=new Intl.DateTimeFormat('en-US',{timeZone:settings.timezoneName,weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date());return`${settings.timezoneLabel}: ${formatted}.`;}
  return fallback(kind,settings,state);
}
async function dispatchProvider(kind,args,event,context,settings,state){const provider=kind;const now=Date.now();if(!settings.useOnlineProviders||now<(state.providerBlockedUntil[provider]||0))return false;let requestedNumber='random';if(kind==='number'&&args.length){const parsed=Number(args[0]);if(!Number.isSafeInteger(parsed)||parsed<0||parsed>1_000_000){await reply(context,event,`Use !${settings.numberFactCommand} with a whole number from 0 to 1000000.`);return true;}requestedNumber=String(parsed);}for(const [id,item] of pending)if(item.expiresAt<=now){context.schedule.cancel(item.timeoutId);pending.delete(id);}if(pending.size>=20)return false;const requestId=`fun-${now}-${Math.random().toString(36).slice(2,10)}`;const timeoutId=context.schedule.after(20_000,async()=>{operation=operation.then(async()=>{const request=pending.get(requestId);if(!request)return;pending.delete(requestId);const latestSettings=settingsFor(context);const latestState=stateFor(await context.state.read());latestState.providerBlockedUntil[provider]=Date.now()+300_000;const response=fallback(provider,latestSettings,latestState);await context.state.write(latestState);await reply(context,request.event,response);},async()=>undefined);await operation;});pending.set(requestId,{kind,event,expiresAt:now+20_000,timeoutId});try{await context.streamerbot.runApprovedAction(FETCH_ACTION_ID,{villageFunRequestId:requestId,villageFunProvider:provider,villageFunNumber:requestedNumber});return true;}catch{context.schedule.cancel(timeoutId);pending.delete(requestId);state.providerBlockedUntil[provider]=now+300_000;return false;}}
async function dispatchFollowAge(event,context){if(event.platform!=='twitch')return false;const viewerId=clean(event.user?.id,180);const broadcasterId=clean(event.channel?.id,180);const viewerName=clean(event.user?.displayName||event.user?.name,50)||'Villager';const channelName=clean(event.channel?.name,50)||'this channel';if(!viewerId||!broadcasterId){await reply(context,event,`${viewerName}, Twitch did not provide the IDs needed to check follow age.`);return true;}if(viewerId===broadcasterId){await reply(context,event,`${viewerName}, you are the broadcaster of ${channelName}.`);return true;}const now=Date.now();for(const [id,item] of pending)if(item.expiresAt<=now){context.schedule.cancel(item.timeoutId);pending.delete(id);}if(pending.size>=20){await reply(context,event,'Twitch follow age is busy right now. Please try again shortly.');return true;}const requestId=`follow-${now}-${Math.random().toString(36).slice(2,10)}`;const timeoutId=context.schedule.after(15_000,async()=>{operation=operation.then(async()=>{const request=pending.get(requestId);if(!request)return;pending.delete(requestId);await reply(context,request.event,'Twitch follow age is temporarily unavailable. Please try again later.');},async()=>undefined);await operation;});pending.set(requestId,{kind:'followage',event,expiresAt:now+15_000,timeoutId});try{await context.streamerbot.runApprovedAction(FOLLOW_AGE_ACTION_ID,{villageFunRequestId:requestId,villageFunViewerId:viewerId,villageFunBroadcasterId:broadcasterId,villageFunViewerName:viewerName,villageFunChannelName:channelName});return true;}catch{context.schedule.cancel(timeoutId);pending.delete(requestId);await reply(context,event,'Twitch follow age is unavailable until its Streamer.bot helper is imported and approved.');return true;}}
async function processCommand(event,context){const settings=settingsFor(context);if(!settings.enabled||event.metadata?.simulated===true||event.eventType!=='command.received'||event.source?.eventName!=='NormalizedCommand')return;const command=commandName(event.payload?.command,'');const kind=commandMap(settings).get(command);if(!kind)return;const state=stateFor(await context.state.read());const now=Date.now();if(!applyCooldown(event,kind,settings,state,now))return;const args=argumentsFor(event);if(kind==='followage'){await dispatchFollowAge(event,context);await context.state.write(state);return;}if(PROVIDERS.has(kind)){const dispatched=await dispatchProvider(kind,args,event,context,settings,state);await context.state.write(state);if(dispatched)return;const response=fallback(kind,settings,state);await context.state.write(state);await reply(context,event,response);return;}const response=localResponse(kind,args,event,settings,state);await context.state.write(state);await reply(context,event,response);}
async function processProvider(event,context){if(event.eventType!==CONTENT_EVENT||event.platform!=='system'||event.metadata?.simulated===true)return;const requestId=clean(event.payload?.requestId,100);const request=pending.get(requestId);if(!request||request.expiresAt<Date.now()){if(request)context.schedule.cancel(request.timeoutId);pending.delete(requestId);return;}context.schedule.cancel(request.timeoutId);pending.delete(requestId);let content=event.payload?.succeeded===true?providerContent(event.payload?.content):'';if(request.kind==='followage'){await reply(context,request.event,content||'Twitch follow age is temporarily unavailable. Please try again later.');return;}const settings=settingsFor(context);const state=stateFor(await context.state.read());if(!content||!recordRecent(request.kind,content,settings,state)){content=fallback(request.kind,settings,state);state.providerBlockedUntil[request.kind]=Date.now()+300_000;}else state.providerBlockedUntil[request.kind]=0;await context.state.write(state);await reply(context,request.event,content);}
export default{manifest,required:false,async start(context){for(const item of pending.values())context.schedule.cancel(item.timeoutId);pending.clear();operation=Promise.resolve();const state=stateFor(await context.state.read());if(!state.sessionKey)state.sessionKey=new Date().toISOString().slice(0,10);await context.state.write(state);},async stop(context){for(const item of pending.values())context.schedule.cancel(item.timeoutId);pending.clear();await operation.catch(()=>undefined);operation=Promise.resolve();},async onEvent(event,context){operation=operation.catch(()=>undefined).then(async()=>{if(event.eventType===CONTENT_EVENT)await processProvider(event,context);else if(event.eventType==='command.received')await processCommand(event,context);else if(event.eventType==='stream.online'){const state=stateFor(await context.state.read());state.sessionKey=clean(event.receivedAt,10)||new Date().toISOString().slice(0,10);await context.state.write(state);}});await operation;}};
export{CONTENT_EVENT,FALLBACKS,aesthetic,commandMap,fallback,manifest,processCommand,processProvider,settingsFor,stateFor};
