'use strict';
// "Report a bug" for beta testers. It downloads the sanitized support bundle (passwords, tokens, webhook links and
// keys are removed by the Bridge) and opens the project's beta-feedback form on GitHub with the version and the
// tester's own words filled in. Nothing is sent anywhere by the Wizard itself: the tester attaches the file and submits.

/* global byId, state, prepareAndDownloadSupportBundle */

const BUG_REPORT_FORM = 'https://github.com/surakage/THSV-StreamBridge/issues/new';
const BUG_REPORT_STAGES = ['Installing', 'First setup in the wizard', 'Streamer.bot import', 'Private test stream', 'Real stream', 'Something else'];

function bugReportVersion() {
  return String(state.overview?.version || state.overview?.build?.version || '').trim();
}

function bugReportText(form) {
  const stage = form.elements.stage.value;
  const notes = form.elements.notes.value.trim();
  return [`StreamBridge ${bugReportVersion() || '(version unknown)'}`, `What I was doing: ${stage}`, '', notes].join('\n');
}

/** The pre-filled GitHub link. The description is capped so the link stays short enough for every browser. */
function bugReportLink(form) {
  const notes = form.elements.notes.value.trim();
  const params = new URLSearchParams({
    template: 'beta_feedback.yml',
    title: `[Beta] ${notes.split('\n')[0].slice(0, 70) || 'Bug report'}`,
    stage: form.elements.stage.value,
    version: bugReportVersion(),
    notes: notes.slice(0, 1500),
  });
  return `${BUG_REPORT_FORM}?${params.toString()}`;
}

function openBugReport() {
  const dialog = byId('bug-report-dialog');
  if (!dialog) return;
  byId('bug-report-state').textContent = '';
  byId('bug-report-copy').hidden = true;
  dialog.showModal();
  dialog.querySelector('textarea')?.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  const dialog = byId('bug-report-dialog');
  const form = byId('bug-report-form');
  if (!dialog || !form) return;
  form.elements.stage.innerHTML = BUG_REPORT_STAGES.map((stage) => `<option>${stage}</option>`).join('');
  const reportButton = byId('report-bug');
  reportButton?.addEventListener('click', openBugReport);
  // Shown once the Wizard is unlocked, like Restart Bridge: the support file needs the unlocked Wizard.
  const workspace = byId('workspace');
  const syncButton = () => { if (reportButton && workspace) reportButton.classList.toggle('hidden', workspace.classList.contains('hidden')); };
  if (workspace) new MutationObserver(syncButton).observe(workspace, { attributes: true, attributeFilter: ['class'] });
  syncButton();
  byId('bug-report-cancel').addEventListener('click', () => dialog.close());
  const note = byId('bug-report-state');
  const copy = byId('bug-report-copy');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(bugReportText(form)); note.textContent = 'Report copied. Paste it with the downloaded file wherever you were asked to send beta feedback.'; }
    catch { note.textContent = 'Copying is blocked in this browser. Select the text in the box and copy it yourself.'; }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      // Open the tab straight from the click, before any waiting, so the browser does not block it as a pop-up.
      window.open(bugReportLink(form), '_blank', 'noopener');
      if (form.elements.bundle.checked) {
        note.textContent = 'Preparing the support file…';
        await prepareAndDownloadSupportBundle(button);
      }
      note.textContent = form.elements.bundle.checked
        ? 'Done. The support file downloaded (look for THSV-StreamBridge-support…zip). On the GitHub page, drag that file into "Support bundle", then press Submit.'
        : 'The GitHub page opened. Check the details, then press Submit.';
      copy.hidden = false;
    } catch (error) {
      note.textContent = `The report could not be prepared: ${error.message}. Use Copy report instead.`;
      copy.hidden = false;
    } finally { button.disabled = false; }
  });
});
