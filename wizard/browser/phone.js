'use strict';
// Phone Control Panel: loaded only on the copy of the Control Panel that StreamBridge serves to phones on the home
// Wi-Fi. A phone pairs once with the 6-digit code shown on the PC and keeps its own key in this browser. The key
// works only on the home network and can be removed on the PC at any time.
(() => {
  const KEY = 'thsv.streambridge.phone.key';
  const byId = (id) => document.getElementById(id);
  const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const write = (value) => { try { if (value) localStorage.setItem(KEY, value); else localStorage.removeItem(KEY); } catch { /* Private window: this visit only. */ } };
  const phoneName = () => { const agent = navigator.userAgent; return /iPad/u.test(agent) ? 'iPad' : /iPhone/u.test(agent) ? 'iPhone' : /Android/u.test(agent) ? 'Android phone' : 'Phone'; };
  function element(tag, attributes = {}, text) { const node = document.createElement(tag); for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value); if (text !== undefined) node.textContent = text; return node; }

  function showRetry(message) {
    const login = byId('login');
    const retry = element('button', { type: 'button' }, 'Try again');
    retry.addEventListener('click', () => location.reload());
    login.replaceChildren(element('h2', { id: 'login-heading' }, 'StreamBridge is not answering'), element('p', {}, 'Check that StreamBridge is running on your PC and that this phone is on the same Wi-Fi.'), retry, element('p', { id: 'login-error', class: 'error', role: 'alert' }, message));
    login.classList.remove('hidden');
  }

  function showPairing(authenticate, message = '') {
    const login = byId('login');
    const input = element('input', { id: 'phone-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '7', spellcheck: 'false' });
    const button = element('button', { type: 'submit' }, 'Pair');
    const form = element('form', { id: 'phone-pair-form' });
    form.append(element('label', { for: 'phone-code' }, 'Pairing code'), input, button);
    const error = element('p', { id: 'login-error', class: 'error', role: 'alert' }, message);
    login.replaceChildren(
      element('h2', { id: 'login-heading' }, 'Pair this phone'),
      element('p', {}, 'On your PC, open StreamBridge, go to Start here and press Pair a phone. Then type the 6-digit code here.'),
      form, error,
      element('p', { class: 'hint' }, 'Tip: add this page to your home screen to open it like an app.'),
    );
    login.classList.remove('hidden');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      button.disabled = true; error.textContent = '';
      void (async () => {
        try {
          const response = await fetch('/phone/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: input.value.replace(/\s/gu, ''), name: phoneName() }) });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || typeof result.key !== 'string') throw new Error(result.error || 'Pairing failed.');
          write(result.key);
          await authenticate(result.key);
        } catch (failure) { error.textContent = failure.message; }
        finally { button.disabled = false; }
      })();
    });
    input.focus();
  }

  window.thsvPhone = {
    async start(authenticate) {
      const key = read();
      if (key) {
        try { await authenticate(key); return; }
        catch (error) { if (error.status !== 401) { showRetry(error.message); return; } write(''); }
      }
      showPairing(authenticate);
    },
    /** The PC removed this phone, or turned the Phone Control Panel off: forget the key and pair again. */
    lost() { if (!read()) return; write(''); location.reload(); },
  };
})();
