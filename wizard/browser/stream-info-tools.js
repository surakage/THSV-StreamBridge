'use strict';
// Wizard tools for the Stream info pop-out (Creator Controls and Category Pilot) and the console
// sign-ins Category Pilot uses for Xbox and PlayStation. Secrets go to the Bridge once and are
// never shown again: the Wizard only learns whether one is saved.

/* global api, safe, showWizardFeedback, state */

async function openStreamInfoPopout(button) {
  button.disabled = true;
  try {
    const { ticket } = await api('/wizard/api/unlock-tickets', { method: 'POST' });
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(ticket)) throw new Error('The Bridge returned an invalid unlock link.');
    window.open(`/wizard/stream-info#unlock=${ticket}`, 'thsv-stream-info', 'popup,width=560,height=860,noopener');
  } catch (error) { showWizardFeedback(error.message, 'error', button); }
  finally { button.disabled = false; }
}

function renderStreamInfoTools(addOn) {
  if (addOn.moduleId !== 'thsv.creator-controls' && addOn.moduleId !== 'thsv.category-pilot') return '';
  const popout = `<section class="form-section stream-info-tools" aria-label="Stream info pop-out"><h4>Stream info pop-out</h4><p>Open a small window where you can pick a profile, edit the title and categories, and press <strong>Update all platforms</strong>. It needs Streamer.bot connected and Creator Controls turned on.</p><button type="button" data-open-stream-info>Open pop-out</button></section>`;
  if (addOn.moduleId !== 'thsv.category-pilot') return popout;
  return `${popout}<section class="form-section console-sign-ins" aria-label="Console sign-ins" data-console-sign-ins><h4>Console sign-ins</h4><p>Category Pilot can ask Xbox and PlayStation which game you are playing, then suggest or apply the profile you chose under <strong>Console games</strong>. Nintendo Switch cannot be detected.</p>
<div class="console-cards"><form class="console-card" data-console-form="xbox" autocomplete="off"><div class="console-card-head"><h5>Xbox (OpenXBL)</h5><span class="status-chip" data-console-saved="xbox">Checking…</span></div><ol class="console-steps"><li>Go to <a href="https://xbl.io" target="_blank" rel="noopener noreferrer">xbl.io</a> and sign in with your Xbox account.</li><li>Open your profile and copy your API key. The free plan is enough.</li><li>Paste it here and press Save.</li></ol><div class="console-key-row"><label>OpenXBL API key<input type="password" name="secret" spellcheck="false" autocomplete="off"></label><div class="console-key-actions"><button type="submit">Save</button><button type="button" class="ghost" data-console-test="xbox">Test</button><button type="button" class="ghost" data-console-clear="xbox">Remove</button></div></div><p class="console-sign-in-state" data-console-state="xbox" role="status"></p></form>
<form class="console-card" data-console-form="playstation" autocomplete="off"><div class="console-card-head"><h5>PlayStation (NPSSO)</h5><span class="status-chip" data-console-saved="playstation">Checking…</span></div><p class="notice"><strong>Unofficial:</strong> this uses PlayStation's own app sign-in, not a public API. Sony may change it and it may stop working. The NPSSO signs in to your account, so keep it private.</p><ol class="console-steps"><li>Sign in at <a href="https://www.playstation.com" target="_blank" rel="noopener noreferrer">playstation.com</a> in your browser.</li><li>In the same browser, open <a href="https://ca.account.sony.com/api/v1/ssocookie" target="_blank" rel="noopener noreferrer">ca.account.sony.com/api/v1/ssocookie</a>.</li><li>Copy the long code after <code>npsso</code> (or the whole line), paste it here and press Save. It lasts about two months; save a new one when it stops working.</li></ol><div class="console-key-row"><label>NPSSO<input type="password" name="secret" spellcheck="false" autocomplete="off"></label><div class="console-key-actions"><button type="submit">Save</button><button type="button" class="ghost" data-console-test="playstation">Test</button><button type="button" class="ghost" data-console-clear="playstation">Remove</button></div></div><p class="console-sign-in-state" data-console-state="playstation" role="status"></p></form></div>
<p class="notice">Turn on <strong>Detect Xbox games</strong> or <strong>Detect PlayStation games</strong> above, save, and restart StreamBridge. Consoles are checked only while live (when that setting is on), at most every 30 seconds.</p></section>`;
}

function renderConsoleSignInStatus(status) {
  for (const platform of ['xbox', 'playstation']) {
    const chip = document.querySelector(`[data-console-saved="${platform}"]`);
    if (!chip) continue;
    const saved = status?.[platform]?.saved === true;
    chip.textContent = saved ? 'Saved' : 'Not saved';
    chip.className = `status-chip ${saved ? 'status-ready' : 'status-neutral'}`;
  }
}

async function loadConsoleSignIns() {
  if (!document.querySelector('[data-console-sign-ins]') || !state.token) return;
  try { renderConsoleSignInStatus(await api('/wizard/api/console-presence')); }
  catch { renderConsoleSignInStatus(undefined); }
}

async function saveConsoleSignIn(platform, body, note) {
  const status = await api('/wizard/api/console-presence', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  renderConsoleSignInStatus(status);
  note.textContent = body.clear ? 'Removed.' : 'Saved. It is stored protected on this PC and never shown again.';
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const open = target?.closest('[data-open-stream-info]');
  if (open) { void openStreamInfoPopout(open); return; }
  const test = target?.closest('[data-console-test]');
  const clear = target?.closest('[data-console-clear]');
  const platform = test?.dataset.consoleTest || clear?.dataset.consoleClear;
  if (!platform) return;
  const note = document.querySelector(`[data-console-state="${platform}"]`);
  const button = test || clear;
  button.disabled = true;
  const work = test
    ? api('/wizard/api/console-presence/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform }) }).then((result) => { note.textContent = result.ok ? (result.titleName ? `Working. Now playing: ${result.titleName}` : 'Working. No game is running right now.') : result.error; })
    : saveConsoleSignIn(platform, { clear: [platform] }, note);
  work.catch((error) => { note.textContent = error.message; }).finally(() => { button.disabled = false; });
});

document.addEventListener('submit', (event) => {
  const form = event.target instanceof Element ? event.target.closest('[data-console-form]') : null;
  if (!form) return;
  event.preventDefault();
  const platform = form.dataset.consoleForm;
  const input = form.querySelector('input[name="secret"]');
  const value = input.value.trim(); input.value = '';
  const note = form.querySelector('[data-console-state]');
  if (!value) { note.textContent = platform === 'xbox' ? 'Paste your OpenXBL API key first.' : 'Paste your NPSSO first.'; return; }
  if (value === state.token) { note.textContent = 'That is the Wizard password. Paste the console sign-in instead.'; return; }
  saveConsoleSignIn(platform, platform === 'xbox' ? { xboxApiKey: value } : { playstationNpsso: value }, note).catch((error) => { note.textContent = error.message; });
});

// The add-on page is rebuilt often; fill the saved / not saved chips whenever the section appears.
new MutationObserver(() => {
  const section = document.querySelector('[data-console-sign-ins]:not([data-loaded])');
  if (!section) return;
  section.dataset.loaded = 'true';
  void loadConsoleSignIns();
}).observe(document.body, { childList: true, subtree: true });
