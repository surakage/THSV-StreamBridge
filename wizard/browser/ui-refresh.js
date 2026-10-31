// Small interface helpers shared by every Wizard page.
// Number boxes get - and + buttons. They are pointer helpers only: keyboard and screen-reader users keep
// the number box itself (arrow keys work there), so the buttons are hidden from assistive technology and
// are spans rather than buttons, which keeps each <label> pointing at its number box.
(() => {
  'use strict';
  const nudge = (input, direction) => {
    if (input.disabled || input.readOnly) return;
    const before = input.value;
    try { if (direction > 0) input.stepUp(); else input.stepDown(); } catch { return; }
    if (input.value === before) return;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const control = (input, direction) => {
    const element = document.createElement('span');
    element.className = `stepper-button stepper-${direction > 0 ? 'up' : 'down'}`;
    element.setAttribute('aria-hidden', 'true');
    element.addEventListener('mousedown', (event) => event.preventDefault());
    element.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); nudge(input, direction); });
    return element;
  };
  // Sidebar icons, drawn inline because the Wizard's content policy only loads images from itself.
  const NAV_ICONS = {
    'overview': '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
    'setup-checklist': '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    'platforms': '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M17 2l-5 5-5-5"/>',
    'blockers': '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    'streamerbot': '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
    'command-sync': '<path d="M4 17l6-5-6-5M12 19h8"/>',
    'timed-actions': '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    'chat-overlay': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'live-captions': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>',
    'alerts': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    'viewer-foundation': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    'community-analytics': '<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>',
    'extensions': '<path d="M12 2l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
    'addons': '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>',
    'addon-marketplace': '<path d="M3 9l1-5h16l1 5M3 9h18v11H3zM9 20v-6h6v6"/>',
    'ownership': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    'release-readiness': '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1zM12 15l-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/>',
    'diagnostics': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    'lock': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'default': '<circle cx="12" cy="12" r="3"/>',
  };
  const decorateNav = (root) => {
    for (const button of root.querySelectorAll('.workspace > nav .nav')) {
      // Page code sometimes rewrites a button's text, which drops the icon, so check for it each time.
      if (button.querySelector(':scope > .nav-icon')) continue;
      const key = button.classList.contains('lock') ? 'lock' : button.dataset.view;
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'nav-icon');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '2');
      icon.setAttribute('stroke-linecap', 'round');
      icon.setAttribute('stroke-linejoin', 'round');
      icon.setAttribute('aria-hidden', 'true');
      icon.setAttribute('focusable', 'false');
      icon.innerHTML = NAV_ICONS[key] ?? NAV_ICONS.default;
      button.prepend(icon);
    }
  };
  // Short choice lists (2 to 4 short options) become a row of pill buttons. The select stays in the form,
  // hidden, so saving and the page's own change handlers work unchanged.
  const segment = (select) => {
    const options = [...select.options];
    if (select.multiple || options.length < 2 || options.length > 4 || options.some((option) => option.text.trim().length > 18 || option.disabled)) return;
    select.dataset.segmented = 'true';
    const label = select.closest('label');
    const group = document.createElement('div');
    group.className = 'segmented';
    // The pills are a mouse and touch shortcut. The select stays the one labelled, keyboard and screen-reader control,
    // so the pills sit after the label (not inside it) and are hidden from assistive technology.
    group.setAttribute('aria-hidden', 'true');
    const sync = () => { for (const button of group.children) button.setAttribute('aria-pressed', String(button.dataset.value === select.value)); };
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'segmented-option';
      button.tabIndex = -1;
      button.dataset.value = option.value;
      button.textContent = option.text.trim();
      button.addEventListener('click', () => {
        if (select.value === option.value) return;
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      group.append(button);
    }
    select.addEventListener('change', sync);
    select.classList.add('segmented-source');
    (label || select).after(group);
    sync();
  };
  // Long pages get an "On this page" bar and a "Part N" label on each top-level card, so the parts read as
  // separate steps instead of one long scroll. Pages with fewer than three titled parts are left alone.
  const sectionTitle = (section) => section.querySelector(':scope > .title-row h3, :scope > h3, :scope > summary strong, :scope > .title-row h4');
  const outlinePage = (panel) => {
    if (panel.querySelector(':scope > .page-sections')) return;
    const parts = [...panel.querySelectorAll(':scope > section.transaction, :scope > details.transaction')].filter((section) => sectionTitle(section)?.textContent.trim());
    if (parts.length < 3) return;
    const bar = document.createElement('nav');
    bar.className = 'page-sections';
    bar.setAttribute('aria-label', 'On this page');
    const label = document.createElement('span');
    label.className = 'page-sections-label';
    label.textContent = 'On this page';
    bar.append(label);
    parts.forEach((section, index) => {
      const title = sectionTitle(section);
      section.dataset.partNumber = String(index + 1);
      if (!title.previousElementSibling?.classList.contains('part-label')) {
        const part = document.createElement('span');
        part.className = 'part-label';
        part.textContent = `Part ${index + 1}`;
        title.before(part);
      }
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'ghost compact page-section-link';
      link.textContent = `${index + 1}. ${title.textContent.trim()}`;
      link.addEventListener('click', () => {
        if (section.tagName === 'DETAILS') section.open = true;
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        (title.closest('summary') ?? title).focus?.({ preventScroll: true });
      });
      bar.append(link);
    });
    const heading = panel.querySelector(':scope > .title-row, :scope > .page-header, :scope > h2');
    if (heading) heading.after(bar); else panel.prepend(bar);
  };
  const enhance = (root) => {
    for (const select of root.querySelectorAll('.addon-setting select:not([data-segmented]):not([data-scene-catalog-select])')) segment(select);
    for (const input of root.querySelectorAll('input[type="number"]:not([data-stepper])')) {
      input.dataset.stepper = 'true';
      const wrapper = document.createElement('span');
      wrapper.className = 'stepper';
      input.replaceWith(wrapper);
      wrapper.append(control(input, -1), input, control(input, 1));
    }
  };
  const start = () => {
    enhance(document);
    decorateNav(document);
    for (const panel of document.querySelectorAll('.view[data-panel]')) outlinePage(panel);
    new MutationObserver((records) => {
      decorateNav(document);
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) enhance(node.matches('input') ? node.parentElement ?? node : node);
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
