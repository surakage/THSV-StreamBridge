// Wizard languages.
//
// The Wizard is written in English. When another language is picked, this script loads that
// language's word list (/wizard/i18n/<code>.js) and swaps any interface text that exactly matches an
// English entry: page text, button labels, placeholders, titles and accessible names. Pages that
// draw themselves later are covered too, because new text is translated as it appears. Text with
// no translation simply stays in English, and viewer content (chat, names) is never touched.
(() => {
  'use strict';
  const LANGUAGES = Object.freeze([
    ['en', 'English'], ['es', 'Español'], ['de', 'Deutsch'], ['fr', 'Français'], ['it', 'Italiano'],
    ['pt-BR', 'Português (Brasil)'], ['ja', '日本語'], ['ko', '한국어'], ['zh-CN', '简体中文'],
  ]);
  const STORAGE_KEY = 'thsv.wizard.language';
  const SKIP = 'script,style,textarea,input,select option[value=""],code,pre,kbd,[data-no-translate],[contenteditable="true"]';
  const ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

  const supported = new Set(LANGUAGES.map(([code]) => code));
  const stored = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
  const language = stored && supported.has(stored) ? stored : 'en';

  // Each language is shown as its country's flag. The flags are drawn here rather than as emoji,
  // because Windows shows flag emoji as two letters. The language's own name stays as the tooltip
  // and the accessible name.
  const FLAGS = Object.freeze({
    en: '<rect width="30" height="20" fill="#012169"/><path d="M0 0l30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0l30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.6"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.4"/>',
    es: '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>',
    de: '<rect width="30" height="20" fill="#ffce00"/><rect width="30" height="13.33" fill="#dd0000"/><rect width="30" height="6.67" fill="#000"/>',
    fr: '<rect width="30" height="20" fill="#ef4135"/><rect width="20" height="20" fill="#fff"/><rect width="10" height="20" fill="#0055a4"/>',
    it: '<rect width="30" height="20" fill="#ce2b37"/><rect width="20" height="20" fill="#fff"/><rect width="10" height="20" fill="#009246"/>',
    'pt-BR': '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2.5L27 10 15 17.5 3 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.6 9.2q4.6-1.2 8.8 1.4" stroke="#fff" stroke-width=".8" fill="none"/>',
    ja: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
    ko: '<rect width="30" height="20" fill="#fff"/><g transform="rotate(33.7 15 10)"><path d="M10 10a5 5 0 0 1 10 0z" fill="#cd2e3a"/><path d="M10 10a5 5 0 0 0 10 0z" fill="#0047a0"/><circle cx="12.5" cy="10" r="2.5" fill="#cd2e3a"/><circle cx="17.5" cy="10" r="2.5" fill="#0047a0"/></g><g fill="#000"><g transform="translate(5.2 3.8) rotate(-56.3)"><rect x="-2.4" y="-1.5" width="4.8" height=".7"/><rect x="-2.4" y="-.35" width="4.8" height=".7"/><rect x="-2.4" y=".8" width="4.8" height=".7"/></g><g transform="translate(24.8 16.2) rotate(-56.3)"><rect x="-2.4" y="-1.5" width="4.8" height=".7"/><rect x="-2.4" y="-.35" width="4.8" height=".7"/><rect x="-2.4" y=".8" width="4.8" height=".7"/></g><g transform="translate(24.8 3.8) rotate(56.3)"><rect x="-2.4" y="-1.5" width="4.8" height=".7"/><rect x="-2.4" y="-.35" width="4.8" height=".7"/><rect x="-2.4" y=".8" width="4.8" height=".7"/></g><g transform="translate(5.2 16.2) rotate(56.3)"><rect x="-2.4" y="-1.5" width="4.8" height=".7"/><rect x="-2.4" y="-.35" width="4.8" height=".7"/><rect x="-2.4" y=".8" width="4.8" height=".7"/></g></g>',
    'zh-CN': '<rect width="30" height="20" fill="#ee1c25"/><g fill="#ffde00"><path d="M5 2l1.18 3.6H10L6.9 7.8l1.2 3.6L5 9.2l-3.1 2.2 1.2-3.6L0 5.6h3.8z"/><circle cx="10" cy="2" r=".9"/><circle cx="12" cy="4" r=".9"/><circle cx="12" cy="7" r=".9"/><circle cx="10" cy="9" r=".9"/></g>',
  });
  const flag = (code) => `<svg class="language-flag" viewBox="0 0 30 20" aria-hidden="true" focusable="false">${FLAGS[code] ?? ''}</svg>`;

  function addPicker() {
    const actions = document.querySelector('header .header-actions, header nav, header');
    if (!actions || document.getElementById('wizard-language')) return;
    const names = new Map(LANGUAGES);
    const picker = document.createElement('div');
    picker.className = 'language-picker';
    picker.dataset.noTranslate = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'wizard-language';
    button.className = 'language-button ghost';
    button.value = language;
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', `Language: ${names.get(language)}`);
    button.title = names.get(language);
    button.innerHTML = flag(language);
    const menu = document.createElement('ul');
    menu.className = 'language-menu';
    menu.id = 'wizard-language-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Language');
    menu.hidden = true;
    button.setAttribute('aria-controls', menu.id);
    for (const [code, name] of LANGUAGES) {
      const option = document.createElement('li');
      option.setAttribute('role', 'option');
      option.dataset.language = code;
      option.lang = code;
      option.tabIndex = -1;
      option.title = name;
      option.setAttribute('aria-label', name);
      option.setAttribute('aria-selected', String(code === language));
      option.innerHTML = flag(code);
      menu.append(option);
    }
    const options = () => [...menu.querySelectorAll('[role="option"]')];
    const close = (focusButton) => {
      menu.hidden = true; button.setAttribute('aria-expanded', 'false');
      if (focusButton) button.focus();
    };
    const open = () => {
      menu.hidden = false; button.setAttribute('aria-expanded', 'true');
      (options().find((item) => item.dataset.language === language) ?? options()[0])?.focus();
    };
    const choose = async (code) => {
      close(true);
      if (!supported.has(code) || code === language) return;
      try { localStorage.setItem(STORAGE_KEY, code); } catch { /* private window: this visit only */ }
      // Chat commands and the Translate add-on follow the saved StreamBridge language, so the choice
      // is also staged as a configuration change. It waits under Unsaved changes for Save with backup.
      button.disabled = true;
      try {
        if (typeof stageConfigurationChange === 'function' && typeof state === 'object' && state?.token) {
          await stageConfigurationChange({ kind: 'language', language: code });
        }
      } catch { /* The Wizard text still switches; the language can be picked again once signed in. */ }
      location.reload();
    };
    button.addEventListener('click', () => { if (menu.hidden) open(); else close(false); });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); }
    });
    menu.addEventListener('click', (event) => {
      const option = event.target.closest?.('[role="option"]');
      if (option) void choose(option.dataset.language);
    });
    menu.addEventListener('keydown', (event) => {
      const list = options(); const index = list.indexOf(document.activeElement);
      const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (move) { event.preventDefault(); list[(index + move + list.length) % list.length]?.focus(); }
      else if (event.key === 'Home') { event.preventDefault(); list[0]?.focus(); }
      else if (event.key === 'End') { event.preventDefault(); list.at(-1)?.focus(); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (index >= 0) void choose(list[index].dataset.language); }
      else if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); close(event.key === 'Escape'); }
    });
    document.addEventListener('click', (event) => { if (!menu.hidden && !picker.contains(event.target)) close(false); });
    picker.append(button, menu);
    const themeToggle = actions.querySelector('#theme-toggle, [data-theme-toggle]');
    if (themeToggle) themeToggle.before(picker); else actions.append(picker);
  }

  // Pages such as the Control Panel follow the Wizard's choice without showing their own picker.
  if (document.currentScript?.dataset.picker !== 'off') addPicker();
  document.documentElement.lang = language;
  if (language === 'en') return;

  const script = document.createElement('script');
  script.src = `/wizard/i18n/${language}.js`;
  script.addEventListener('load', () => start(window.THSV_WIZARD_STRINGS?.[language] ?? {}));
  document.head.append(script);

  // Dates and times follow the chosen language too ("10.11.2026, 06:04" rather than "11/10/2026, 6:04 AM"),
  // wherever the Wizard formats one without naming a locale itself.
  for (const name of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
    const original = Date.prototype[name];
    Date.prototype[name] = function localized(locales, options) { return original.call(this, locales ?? language, options); };
  }
  const numberFormat = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function localized(locales, options) { return numberFormat.call(this, locales ?? language, options); };

  function start(dictionary) {
    const table = new Map(Object.entries(dictionary));
    if (table.size === 0) return;
    // Entries with {0}, {1}… hold text that changes, such as "{0} healthy" or a time. The changing
    // parts are kept (and translated too when they are known words, such as a button name).
    // A changing part may be empty ("Download & prepare{0}"). Entries with very little fixed text, such
    // as "Add {0}", only match a short name or number, so they never swallow the start of a sentence.
    const patterns = [...table.entries()].filter(([key]) => /\{\d\}/u.test(key)).map(([key, value]) => ({
      regex: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\\\{(\d)\\\}/gu, '(?<p$1>.*?)')}$`, 'u'),
      loose: key.replace(/\{\d\}/gu, '').trim().length < 12,
      value,
    }));
    const sentenceStart = /^(?:your|the|this|that|these|those|a|an|it|its|them|to|any|all|only|each|every|and|or|in|on|for|with)\b/iu;
    const tooLong = (part) => part.trim().split(/\s+/u).length > 3 || sentenceStart.test(part.trim());
    const lookup = (key) => {
      const direct = table.get(key);
      if (direct !== undefined) return direct;
      // A step number ("2. Sound") or the colon after a bold label (": Optional…") stays; the rest is looked up.
      const prefixed = /^(\d+\. |: )(.+)$/su.exec(key);
      if (prefixed) { const rest = lookup(prefixed[2]); if (rest !== undefined) return `${prefixed[1]}${rest}`; }
      for (const { regex, loose, value } of patterns) {
        const match = regex.exec(key);
        if (loose && match?.groups && Object.values(match.groups).some(tooLong)) continue;
        if (match?.groups) return value.replace(/\{(\d)\}/gu, (_, index) => { const part = match.groups[`p${index}`] ?? ''; return lookup(part) ?? part; });
      }
      return undefined;
    };
    // Text this script wrote is never translated a second time, even if it matches another entry.
    const written = new WeakMap();
    const misses = new Set();
    window.THSV_WIZARD_MISSES = misses;
    const translateText = (node) => {
      const raw = node.nodeValue ?? '';
      if (written.get(node) === raw) return;
      const key = raw.replace(/\s+/gu, ' ').trim();
      if (!key) return;
      const value = lookup(key);
      // Text with no entry is remembered so a test can list what is still in English.
      if (value === undefined && misses.size < 5000) misses.add(key);
      if (value === undefined || value === key) return;
      const lead = raw.match(/^\s*/u)?.[0] ?? '';
      const tail = raw.match(/\s*$/u)?.[0] ?? '';
      node.nodeValue = `${lead}${value}${tail}`;
      written.set(node, node.nodeValue);
    };
    const translateAttributes = (element) => {
      for (const name of ATTRIBUTES) {
        const current = element.getAttribute(name);
        if (!current) continue;
        const value = lookup(current.trim());
        if (value !== undefined && value !== current) element.setAttribute(name, value);
      }
    };
    const skipped = (element) => !element || element.closest(SKIP) !== null;
    // Placeholders and labels on inputs are interface text even though typed values are not.
    const attributeSkipped = (element) => !element || element.closest('script,style,[data-no-translate]') !== null;
    const walk = (root) => {
      if (root.nodeType === Node.TEXT_NODE) { if (!skipped(root.parentElement)) translateText(root); return; }
      if (!(root instanceof Element)) return;
      if (!attributeSkipped(root)) translateAttributes(root);
      for (const element of root.querySelectorAll('[placeholder],[title],[aria-label]')) if (!attributeSkipped(element)) translateAttributes(element);
      if (skipped(root)) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!skipped(node.parentElement)) translateText(node);
    };
    walk(document.body);
    // Confirmation and alert boxes are browser dialogs, not page text, so they are translated as they open.
    for (const name of ['confirm', 'alert']) {
      const original = window[name];
      if (typeof original !== 'function') continue;
      window[name] = (message) => original.call(window, typeof message === 'string' ? (lookup(message.trim()) ?? message) : message);
    }
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') { if (!skipped(mutation.target.parentElement)) translateText(mutation.target); continue; }
        if (mutation.type === 'attributes') { if (mutation.target instanceof Element && !attributeSkipped(mutation.target)) translateAttributes(mutation.target); continue; }
        for (const node of mutation.addedNodes) walk(node);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  }
})();
