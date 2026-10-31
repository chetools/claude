import { api } from './api.js';
import { h, fmtTime, msg } from './util.js';
import { importPreview, pickZip } from './importer.js';
import { state, reroute } from './app.js';
import { showBar, lab } from './bar.js';

const LABEL = { draft: 'Draft', scheduled: 'Scheduled', open: 'Open', closed: 'Closed' };
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
  showBar({ title: 'My exams', actions: [h('button', { class: 'small', onclick: ctx.choose }, lab('Import', ' zip')),
    h('button', { class: 'secondary small', onclick: newBlank }, lab('New blank', ' exam'))] });
  root.append(out);
  const exams = await api('/api/exams');
  if (!exams.length) { root.append(h('p', { class: 'hint' }, 'No exams yet. Import a zip file or create a blank exam.')); return; }
  const me = state.me.email;
  const mine = exams.filter((e) => e.owner_email === me), other = exams.filter((e) => e.owner_email !== me);
  const list = (title, arr) => arr.length ? [h('div', { class: 'section-title' }, title), h('div', { class: 'tablewrap' }, h('table', { class: 'exams' },
    h('thead', {}, h('tr', {}, ['Exam', 'Status', 'Opens', 'Closes', 'Questions', 'Submissions', 'Owner'].map((c) => h('th', {}, c)))),
    h('tbody', {}, arr.map((e) => h('tr', {}, h('td', {}, h('a', { href: '#/exam/' + encodeURIComponent(e.id) + '/questions' }, e.title || e.id)),
      h('td', {}, badge(e.status)), h('td', { class: 'nw' }, fmtTime(e.opens_at)), h('td', { class: 'nw' }, fmtTime(e.closes_at)),
      h('td', {}, String(e.questions)), h('td', {}, h('a', { href: '#/exam/' + encodeURIComponent(e.id) + '/results' }, String(e.submissions))), h('td', {}, e.owner_email))))))] : [];
  root.append(...list('My exams', mine), ...list(state.me.is_admin ? 'Other teachers\' exams' : 'Shared with me', other));
}
