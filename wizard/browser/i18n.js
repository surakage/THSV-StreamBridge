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

  function addPicker() {
    const actions = document.querySelector('header .header-actions, header nav, header');
    if (!actions || document.getElementById('wizard-language')) return;
    const label = document.createElement('label');
    label.className = 'language-picker';
    const caption = document.createElement('span');
    caption.className = 'visually-hidden';
    caption.textContent = 'Language';
    const select = document.createElement('select');
    select.id = 'wizard-language';
    select.setAttribute('aria-label', 'Language');
    select.dataset.noTranslate = '';
    for (const [code, name] of LANGUAGES) {
      const option = document.createElement('option');
      option.value = code; option.textContent = name; option.lang = code;
      select.append(option);
    }
    select.value = language;
    select.addEventListener('change', () => {
      try { localStorage.setItem(STORAGE_KEY, select.value); } catch { /* private window: this visit only */ }
      location.reload();
    });
    label.append(caption, select);
    const themeToggle = actions.querySelector('#theme-toggle, [data-theme-toggle]');
    if (themeToggle) themeToggle.before(label); else actions.append(label);
  }

  addPicker();
  document.documentElement.lang = language;
  if (language === 'en') return;

  const script = document.createElement('script');
  script.src = `/wizard/i18n/${language}.js`;
  script.addEventListener('load', () => start(window.THSV_WIZARD_STRINGS?.[language] ?? {}));
  document.head.append(script);

  function start(dictionary) {
    const table = new Map(Object.entries(dictionary));
    if (table.size === 0) return;
    // Entries with {0}, {1}… hold text that changes, such as "{0} healthy" or a time. The changing
    // parts are kept (and translated too when they are known words, such as a button name).
    const patterns = [...table.entries()].filter(([key]) => /\{\d\}/u.test(key)).map(([key, value]) => ({
      regex: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\\\{(\d)\\\}/gu, '(?<p$1>.+?)')}$`, 'u'),
      value,
    }));
    const lookup = (key) => {
      const direct = table.get(key);
      if (direct !== undefined) return direct;
      for (const { regex, value } of patterns) {
        const match = regex.exec(key);
        if (match?.groups) return value.replace(/\{(\d)\}/gu, (_, index) => { const part = match.groups[`p${index}`] ?? ''; return lookup(part) ?? part; });
      }
      return undefined;
    };
    // Text this script wrote is never translated a second time, even if it matches another entry.
    const written = new WeakMap();
    const translateText = (node) => {
      const raw = node.nodeValue ?? '';
      if (written.get(node) === raw) return;
      const key = raw.replace(/\s+/gu, ' ').trim();
      if (!key) return;
      const value = lookup(key);
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
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') { if (!skipped(mutation.target.parentElement)) translateText(mutation.target); continue; }
        if (mutation.type === 'attributes') { if (mutation.target instanceof Element && !attributeSkipped(mutation.target)) translateAttributes(mutation.target); continue; }
        for (const node of mutation.addedNodes) walk(node);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  }
})();
