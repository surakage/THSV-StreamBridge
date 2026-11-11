// Loaded only by the copy of the StreamBridge pages served from slothbloom.com. It points every call these
// pages make at StreamBridge on this PC and signs them with this browser's pairing key. The pages that
// StreamBridge serves on the PC itself never load this file.
(()=>{
  const KEY='thsv.hosted.key';const PORT='thsv.hosted.port';
  const read=(name)=>{try{return localStorage.getItem(name)||''}catch{return ''}};
  const write=(name,value)=>{try{if(value)localStorage.setItem(name,value);else localStorage.removeItem(name)}catch{/* Pairing then lasts for this visit only. */}};
  const asked=new URLSearchParams(location.search).get('bridge-port');
  if(asked&&/^\d{2,5}$/u.test(asked))write(PORT,asked);
  const port=/^\d{2,5}$/u.test(read(PORT))?read(PORT):'8787';
  const bridge=`http://127.0.0.1:${port}`;
  let key=read(KEY);
  const bridgePath=(path)=>/^\/(?:wizard\/api\/|overlay\/|commands(?:\/|$)|health$|ready$|diagnostics$)/u.test(path.split('?',1)[0]);
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,init={})=>{
    if(typeof input!=='string'||!input.startsWith('/')||!bridgePath(input))return nativeFetch(input,init);
    const headers=new Headers(init.headers||{});
    if(headers.has('authorization')&&key)headers.set('authorization',`Bearer ${key}`);
    return nativeFetch(bridge+input,{...init,headers,credentials:'omit'});
  };
  // Previews and downloads that the pages point at StreamBridge by address rather than by fetch.
  const repoint=(node)=>{if(!(node instanceof Element))return;for(const element of [node,...node.querySelectorAll('[src],a[href]')])for(const name of ['src','href']){const value=element.getAttribute(name);if(value&&value.startsWith('/')&&bridgePath(value))element.setAttribute(name,bridge+value)}};
  new MutationObserver((changes)=>{for(const change of changes){if(change.type==='attributes')repoint(change.target);else for(const node of change.addedNodes)repoint(node)}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src','href']});
  window.thsvHosted={bridge,unpair:()=>{key='';write(KEY,'');location.reload()}};

  addEventListener('DOMContentLoaded',()=>{
    const login=document.getElementById('login');if(!login)return;
    if(typeof window.authenticateWizard!=='function'){
      // A pop-out (Control Panel, Stream info, Jukebox remote): it signs in through its own form, and the
      // key swap above makes that sign-in use this browser's pairing.
      const form=document.getElementById('login-form');const field=document.getElementById('token');if(!form||!field)return;
      form.classList.add('hidden');
      const note=document.createElement('p');note.id='hosted-connect-state';note.setAttribute('role','status');login.append(note);
      if(!key){note.textContent='Pair this browser first.';const link=document.createElement('a');link.href='/wizard/';link.textContent='Connect to StreamBridge on this PC';login.append(' ',link);return}
      note.textContent='Looking for StreamBridge on this PC…';
      setTimeout(()=>{field.value='paired-browser';form.requestSubmit();setTimeout(()=>{if(!login.classList.contains('hidden'))note.textContent='StreamBridge on this PC did not answer.'},4000)},0);
      return;
    }
    for(const child of [...login.children])child.classList.add('hidden');
    const box=document.createElement('div');box.id='hosted-connect';
    const title=document.createElement('h2');title.textContent='Connect to StreamBridge on this PC';
    const status=document.createElement('p');status.id='hosted-connect-state';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent='Looking for StreamBridge on this PC…';
    const form=document.createElement('form');form.className='hidden';form.id='hosted-pair-form';
    const label=document.createElement('label');label.textContent='Pairing code';
    const input=document.createElement('input');input.id='hosted-pair-code';input.inputMode='numeric';input.autocomplete='one-time-code';input.maxLength=7;input.required=true;input.placeholder='123 456';
    const button=document.createElement('button');button.type='submit';button.textContent='Pair this browser';
    const help=document.createElement('p');help.className='notice hidden';help.id='hosted-connect-help';
    const local=document.createElement('a');local.href=`${bridge}/wizard/`;local.textContent='Open the copy on this PC';
    label.append(input);form.append(label,button);box.append(title,status,form,help,local);login.prepend(box);
    const say=(text)=>{status.textContent=text};
    const offerPairing=(text)=>{say(text);form.classList.remove('hidden');help.classList.remove('hidden');help.textContent='In StreamBridge on this PC, open Start here, turn on "Open StreamBridge from slothbloom.com" and choose Pair a browser.';input.focus()};
    async function open(){
      await window.authenticateWizard(key);
      if(document.getElementById('workspace')?.classList.contains('hidden')){key='';write(KEY,'');const error=document.getElementById('login-error');if(error)error.textContent='';offerPairing('This browser is not paired any more. Type a new code to pair it again.')}
    }
    async function start(){
      let health;
      try{const response=await nativeFetch(`${bridge}/health`);health=await response.json()}catch{
        help.classList.remove('hidden');help.textContent='Start StreamBridge on this PC, open Start here in its own Wizard and turn on "Open StreamBridge from slothbloom.com". If your browser asks whether this site may reach apps on this PC, choose Allow. Then reload this page.';
        say('StreamBridge on this PC did not answer.');return;
      }
      const site=document.documentElement.dataset.thsvSiteVersion||'';
      if(site&&typeof health.version==='string'&&health.version!==site){const note=document.createElement('p');note.className='notice';note.id='hosted-version-note';note.textContent=`These pages are for StreamBridge ${site}. This PC has ${health.version}. Update StreamBridge, or use the copy on this PC if something looks wrong.`;box.append(note)}
      if(key)await open();else offerPairing('Type the code StreamBridge shows on this PC.');
    }
    form.addEventListener('submit',(event)=>{event.preventDefault();void (async()=>{button.disabled=true;try{
      const response=await nativeFetch(`${bridge}/wizard/api/hosted-pages/pair`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:input.value,name:(navigator.userAgentData?.platform||navigator.platform||'Browser').slice(0,60)})});
      const body=await response.json();if(!response.ok||typeof body.key!=='string')throw new Error(body.error||'Pairing did not work. Try a new code.');
      key=body.key;write(KEY,key);form.classList.add('hidden');help.classList.add('hidden');say('Paired. Opening StreamBridge…');await open();
    }catch(error){say(error.message==='Failed to fetch'?'StreamBridge on this PC did not answer.':error.message)}finally{button.disabled=false}})()});
    void start();
  });
})();
