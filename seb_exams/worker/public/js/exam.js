import { api, setImg } from './api.js';
import { h, msg, problemList, download, slug, b64decode } from './util.js';
import { renderMd, boxesHtml } from './render.js';
import { fillPattern, validateExam } from '/shared/validate.js';
import { setWidth } from './app.js';
import { badge } from './dashboard.js';

const TABS = [['questions', 'Questions'], ['edit', 'Edit'], ['settings', 'Settings'], ['results', 'Results']];

function statusOf(ex) {
  const now = Date.now();
  if (!ex.opens_at) return 'draft';
  if (new Date(ex.opens_at) > now) return 'scheduled';
  return !ex.closes_at || new Date(ex.closes_at) > now ? 'open' : 'closed';
}

export async function render(root, id, tab) {
  if (!TABS.some((t) => t[0] === tab)) tab = 'questions';
  const ex = await api('/api/exams/' + encodeURIComponent(id));
  setWidth(tab === 'results' ? 'wide' : tab === 'edit' ? 'mid' : '');
  const exportZip = async (btn) => {
    btn.disabled = true;
    try {
      const r = await api(`/api/exams/${encodeURIComponent(id)}/export`);
      const files = { 'exam.yaml': window.fflate.strToU8(r.yaml) };
      for (const [n, b] of Object.entries(r.images || {})) files[n] = b64decode(b);
      download(slug(ex.title || (ex.content && ex.content.title)) + '.zip', [window.fflate.zipSync(files)], 'application/zip');
    } catch (e) { alert('Export failed: ' + e.message); }
    btn.disabled = false;
  };
  const exportBtn = h('button', { class: 'secondary small', onclick: () => exportZip(exportBtn) }, 'Export zip');
  root.append(
    h('p', { class: 'crumb' }, h('a', { href: '#/' }, '← All exams')),
    h('div', { class: 'examhead' }, h('h2', {}, ex.content.title || ex.id), badge(statusOf(ex)), h('span', { class: 'grow' }), exportBtn),
    h('nav', { class: 'tabs' }, TABS.map(([k, label]) => h('a', { href: `#/exam/${encodeURIComponent(id)}/${k}`, class: k === tab ? 'on' : '' }, label))));
  const body = h('div', { class: 'tabbody' });
  root.append(body);
  if (tab === 'questions') await questionsView(body, ex);
  else await (await import(`./${tab}.js`)).render(body, ex);
}

// ---------------------------------------------------------------- Questions tab (read-only, answers marked)
export function questionBody(ex, q, n) {
  const card = h('section', { class: 'card q', id: 'q' + n });
  card.append(h('h3', {}, h('span', {}, `${n}. `, h('span', { class: 'qtype' }, { mc: 'Multiple choice', fill: 'Fill in the blanks', open: 'Open question' }[q.type] || q.type)),
    h('span', { class: 'pts' }, `${q.points} ${q.points === 1 ? 'point' : 'points'}`)));
  const blanks = q.blanks || [];
  const blankHtml = (k) => {
    const b = blanks[k - 1];
    if (!b) return '<span class="bx err">?</span>';
    let pat = ''; try { pat = fillPattern(b); } catch (e) { /* ignore */ }
    return boxesHtml(pat, b.answer);
  };
  card.append(h('div', { class: 'md', html: renderMd(q.text, q.type === 'fill' ? { blanks: blankHtml } : {}) }));
  if (q.image) {
    card.append(h('div', { class: 'figure' }, setImg(h('img', { alt: q.image_alt || '' }), ex.id, q.image)));
    if (q.image_alt) card.append(h('p', { class: 'hint' }, 'Image description: ', q.image_alt));
  }
  if (q.type === 'mc') {
    card.append(h('ol', { class: 'opts', type: 'A' }, (q.options || []).map((o) =>
      h('li', { class: 'opt' + (o.correct ? ' correct' : '') }, h('div', { class: 'md', html: renderMd(o.text) }), o.correct ? h('span', { class: 'tick' }, '✓ correct') : null))),
    h('p', { class: 'hint' }, q.shuffle_options === false ? 'Options are shown in this order.' : 'Options are shuffled for each student.'));
  } else if (q.type === 'fill') {
    card.append(h('table', { class: 'blanktable' }, h('thead', {}, h('tr', {}, ['Blank', 'Answer', 'Also accepted', 'Clue'].map((c) => h('th', {}, c)))),
      h('tbody', {}, blanks.map((b, i) => h('tr', {}, h('td', {}, String(i + 1)), h('td', {}, h('strong', {}, b.answer)),
        h('td', {}, (b.variants || []).join(', ') || '–'), h('td', { html: b.clue ? boxesHtml(b.clue) : '<span class="hint">none</span>' }))))),
    h('p', { class: 'hint' }, 'Graded all-or-nothing: every blank must be right (case-insensitive).'));
  } else {
    card.append(q.model_answer && q.model_answer.trim()
      ? h('div', { class: 'model' }, h('div', { class: 'label' }, 'Model answer (teacher only)'), h('div', { class: 'md', html: renderMd(q.model_answer) }))
      : h('p', { class: 'hint' }, 'No model answer. Graded by hand in the Results tab.'));
  }
  return card;
}

export async function questionsView(body, ex) {
  const c = ex.content, qs = c.questions || [];
  const total = qs.reduce((s, q) => s + Number(q.points || 0), 0);
  let warnings = [];
  try { warnings = validateExam(JSON.parse(JSON.stringify(c)), (ex.images || []).map((i) => i.name)).warnings || []; } catch (e) { /* ignore */ }
  body.append(h('div', { class: 'card summary' },
    h('div', { class: 'stats' }, [['Questions', qs.length], ['Points', total], ['Duration', c.duration_minutes + ' min'],
      ['Multiple choice', qs.filter((q) => q.type === 'mc').length], ['Fill', qs.filter((q) => q.type === 'fill').length], ['Open', qs.filter((q) => q.type === 'open').length]]
      .map(([k, v]) => h('div', { class: 'stat' }, h('div', { class: 'v' }, String(v)), h('div', { class: 'k' }, k)))),
    c.intro && c.intro.trim() ? h('div', { class: 'md intro', html: renderMd(c.intro) }) : null));
  if (warnings.length) body.append(problemList([], warnings));
  qs.forEach((q, i) => body.append(questionBody(ex, q, i + 1)));
}
