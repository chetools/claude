import { api } from './api.js';
import { h, fmtTime, msg, b64encode } from './util.js';
import { importPreview, pickZip, readZip } from './importer.js';
import { state, reroute } from './app.js';
import { showBar, lab } from './bar.js';

const LABEL = { draft: 'Draft', scheduled: 'Scheduled', open: 'Open', closed: 'Closed', practice: 'Practice' };
export const badge = (s) => h('span', { class: 'badge ' + s }, LABEL[s] || s);

export async function render(root) {
  const out = h('div', {});
  const ctx = { body: root, replaceId: null, choose: () => pickZip(start), cancel: () => { state.preview = false; reroute(); } };
  const start = (f) => importPreview(f, ctx);
  const newBlank = async () => {
    const title = prompt('Title of the new exam:', 'New exam');
    if (!title) return;
    const text = window.jsyaml.dump({ format: 'seb-exam/1', title, duration_minutes: 30,
      questions: [{ type: 'open', points: 1, text: 'Replace this question.' }] }, { lineWidth: -1 });
    try {
      const r = await api('/api/exams/import', { method: 'POST', body: { yaml: text, images: {} } });
      location.hash = '#/exam/' + encodeURIComponent(r.id) + '/edit';
    } catch (e) { out.replaceChildren(msg('err', e.message)); }
  };
  // A closed copy of the public example exam with twelve made-up submissions, to try every tab safely.
  const practice = async () => {
    practiceBtn.disabled = true;
    try {
      const r = await fetch('/docs/example-exam.zip');
      if (!r.ok) throw new Error('Could not load the example exam (' + r.status + ').');
      const z = await readZip(await r.blob());
      const images = Object.fromEntries(Object.entries(z.images).map(([n, u8]) => [n, b64encode(u8)]));
      const res = await api('/api/exams/import', { method: 'POST', body: { yaml: z.yaml, images, practice: true } });
      location.hash = '#/exam/' + encodeURIComponent(res.id) + '/questions';
    } catch (e) { out.replaceChildren(msg('err', 'Practice exam not created: ' + e.message)); practiceBtn.disabled = false; }
  };
  const practiceBtn = h('button', { class: 'secondary small', onclick: practice, title: 'A closed copy of the example exam with made-up students, for trying the app' }, lab('Practice', ' exam'));
  showBar({ title: 'My exams', actions: [h('button', { class: 'small', onclick: ctx.choose }, lab('Import', ' zip')),
    h('button', { class: 'secondary small', onclick: newBlank }, lab('New blank', ' exam')), practiceBtn] });
  root.append(out);
  const exams = await api('/api/exams');
  if (!exams.length) { root.append(h('p', { class: 'hint' }, 'No exams yet. Import a zip file, create a blank exam, or press Practice exam to try the app with made-up students.')); return; }
  const me = state.me.email;
  const mine = exams.filter((e) => e.owner_email === me), other = exams.filter((e) => e.owner_email !== me);
  const list = (title, arr) => arr.length ? [h('div', { class: 'section-title' }, title), h('div', { class: 'tablewrap' }, h('table', { class: 'exams' },
    h('thead', {}, h('tr', {}, ['Exam', 'Status', 'Opens', 'Closes', 'Questions', 'Submissions', 'Owner'].map((c) => h('th', {}, c)))),
    h('tbody', {}, arr.map((e) => h('tr', {}, h('td', {}, h('a', { href: '#/exam/' + encodeURIComponent(e.id) + '/questions' }, e.title || e.id), e.practice ? badge('practice') : null),
      h('td', {}, badge(e.status)), h('td', { class: 'nw' }, fmtTime(e.opens_at)), h('td', { class: 'nw' }, fmtTime(e.closes_at)),
      h('td', {}, String(e.questions)), h('td', {}, h('a', { href: '#/exam/' + encodeURIComponent(e.id) + '/results' }, String(e.submissions))), h('td', {}, e.owner_email))))))] : [];
  root.append(...list('My exams', mine), ...list(state.me.is_admin ? 'Other teachers\' exams' : 'Shared with me', other));
}
