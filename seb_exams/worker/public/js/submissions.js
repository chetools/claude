// Submissions tab: list of submissions, and a viewer that shows each one "as entered" (see SPEC, v2.1).
// Tab contract (exam.js): `export async function render(body, ex)`.
import { api, setImg } from './api.js';
import { h, fmtTime, download, slug } from './util.js';
import { renderMd } from './render.js';
import { fillPattern } from '/shared/validate.js';
import { studentOrder, SECTIONS } from '/shared/shuffle.js';

const CSS_URL = new URL('../css/submissions.css', import.meta.url).href;
const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
const TYPE_LABEL = { mc: 'Multiple choice', fill: 'Fill in the blanks', open: 'Open question' };
const round = (x) => Math.round(Number(x) * 100) / 100;
const ALNUM = /[A-Za-z0-9]/;

// Viewer toggles; they stay as set when going back to the list and into the viewer again.
const opts = { order: 'file', marking: true, anon: false };

function ensureCss() {
  if (document.querySelector('link[data-sv-css]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: CSS_URL, 'data-sv-css': '' }));
}

// markdown + KaTeX rendering is repeated for every student, so remember the result per text.
const mdCache = new Map();
function md(text, blankRef) {
  const key = (blankRef ? 'B' : 'T') + text;
  if (!mdCache.has(key)) mdCache.set(key, renderMd(text, blankRef ? { blanks: blankRef } : {}));
  return mdCache.get(key);
}

// ---------------------------------------------------------------- one submission "as entered"
// Fill answer string -> row of boxes. Structure comes from the pattern (clue / "_" boxes / separators); typed
// letters come from the answer string, where an empty box is "_".
function fillBoxes(pattern, answer) {
  const a = typeof answer === 'string' ? answer : '';
  const aligned = a.length === pattern.length;
  const src = aligned || !a ? pattern : a;  // odd data: show what was sent, every character a box
  const cells = [...src].map((c, i) => {
    if (!aligned && a) return c === '_' || !ALNUM.test(c) ? '<span class="sv-bx"></span>' : `<span class="sv-bx typed">${esc1(c)}</span>`;
    if (c === ' ') return '<span class="sv-gap"></span>';
    if (c === '-') return '<span class="sv-sep">-</span>';
    if (c !== '_') return `<span class="sv-bx fixed">${esc1(c)}</span>`;
    const t = aligned ? a[i] : '';
    return t && t !== '_' && ALNUM.test(t) ? `<span class="sv-bx typed">${esc1(t)}</span>` : '<span class="sv-bx"></span>';
  });
  return `<span class="sv-boxes">${cells.join('')}</span>`;
}
const esc1 = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function markBadge(ok) { return h('span', { class: 'sv-mark ' + (ok ? 'ok' : 'bad'), title: ok ? 'correct' : 'wrong' }, ok ? '✓' : '✗'); }

// ctx: {ex, questions, qmap, max, number: Map(submission id -> N)}; o: {order, marking, anon};
// img(el, name): sets the image source (object URL while viewing, data URL in the export).
function buildSub(ctx, s, o, img) {
  const { questions, qmap } = ctx;
  const answers = s.answers || {}, detail = s.detail || {}, manual = s.manual || {};
  const N = ctx.number.get(s.id);
  const root = h('article', { class: 'subview', 'data-sub': String(s.id) });

  const meta = [];
  const add = (k, v) => { if (v !== '' && v != null) meta.push(h('div', {}, h('dt', {}, k), h('dd', {}, v))); };
  add('Started', fmtTime(s.started_at));
  add('Submitted', fmtTime(s.submitted_at));
  if (s.minutes_used != null) add('Time used', s.minutes_used + ' min');
  if (!o.anon) add('Receipt', s.receipt || '');
  if (s.seb_check != null && s.seb_check !== '') add('SEB check', String(s.seb_check));
  if (o.marking) {
    const earned = round(Number(s.total) || 0);
    add('Total', `${earned} / ${ctx.max}`);
  }
  root.append(h('header', { class: 'sv-head' },
    h('div', { class: 'sv-exam' }, ctx.ex.content.title || ctx.ex.id),
    h('h2', {}, o.anon ? `Student ${N}` : [s.name || '(no name)', h('span', { class: 'sv-id' }, s.student_id || '')],
      s.late ? h('span', { class: 'sv-late', title: 'Submitted after the end time' }, 'late') : null),
    h('dl', { class: 'sv-meta' }, meta)));

  // question order
  let ids = questions.map((q) => q.id), optOrder = {};
  if (o.order === 'seen') {
    const so = studentOrder(ctx.ex.content, ctx.ex.id, s.student_id);
    ids = so.questionIds; optOrder = so.optionOrder;
  }
  let lastType = null, n = 0;
  for (const qid of ids) {
    const q = qmap.get(qid);
    if (!q) continue;
    n++;
    if (o.order === 'seen' && q.type !== lastType) {
      lastType = q.type;
      root.append(h('div', { class: 'sv-section' }, (SECTIONS.find((x) => x[0] === q.type) || [0, q.type])[1]));
    }
    root.append(buildQuestion(ctx, s, q, n, o, answers[qid], detail[qid], manual[qid], optOrder[qid], img));
  }
  return root;
}

function buildQuestion(ctx, s, q, n, o, a, d, m, optIds, img) {
  const card = h('section', { class: 'sv-q', 'data-qid': q.id });
  let pts = h('span', { class: 'sv-pts' }, `${q.points} ${q.points === 1 ? 'point' : 'points'}`);
  if (o.marking) {
    if (q.type === 'open') pts = h('span', { class: 'sv-pts' }, `${m && m.points != null ? round(m.points) : '–'} / ${q.points} points`);
    else if (d) pts = h('span', { class: 'sv-pts' }, markBadge(d.ok), ` ${round(d.points)} / ${q.points} points`);
  }
  card.append(h('h3', {}, h('span', {}, `Question ${n} `, h('span', { class: 'sv-qtype' }, TYPE_LABEL[q.type] || q.type)), pts));
  const blanks = q.blanks || [];
  card.append(h('div', { class: 'sv-md', html: md(q.text, q.type === 'fill' ? (k) => `<span class="sv-bref">(${k})</span>` : null) }));
  if (q.image) {
    const im = h('img', { alt: q.image_alt || 'figure', 'data-img': q.image });
    img(im, q.image);
    card.append(h('div', { class: 'sv-figure' }, im));
  }
  if (q.type === 'mc') {
    const opts_ = q.options || [];
    const byId = new Map(opts_.map((op, j) => [String.fromCharCode(97 + j), { op, j }]));
    const order = o.order === 'seen' && optIds ? optIds : [...byId.keys()];
    const list = h('div', { class: 'sv-opts' });
    for (const id of order) {
      const { op, j } = byId.get(id);
      const chosen = a === id;
      const cls = ['sv-opt'];
      if (chosen) cls.push('chosen');
      if (o.marking && op.correct) cls.push('right');
      if (o.marking && chosen && !op.correct) cls.push('wrong');
      list.append(h('div', { class: cls.join(' ') },
        h('span', { class: 'sv-radio', 'aria-label': chosen ? 'chosen' : 'not chosen' }),
        o.order === 'seen' ? null : h('span', { class: 'sv-letter' }, String.fromCharCode(65 + j) + ')'),
        h('div', { class: 'sv-md sv-lab', html: md(op.text) }),
        o.marking && chosen ? markBadge(!!op.correct) : null,
        o.marking && op.correct && !chosen ? h('span', { class: 'sv-tag' }, 'correct answer') : null));
    }
    card.append(list);
    if (!a || !byId.has(a)) card.append(h('p', { class: 'sv-none' }, a ? `Unknown option "${a}"` : '(no answer)'));
  } else if (q.type === 'fill') {
    const arr = Array.isArray(a) ? a : [];
    blanks.forEach((b, i) => {
      let pat = '';
      try { pat = fillPattern(b); } catch (e) { pat = String(b.answer || '').replace(/[A-Za-z0-9]/g, '_'); }
      card.append(h('div', { class: 'sv-fillrow' }, h('div', { class: 'sv-blabel' }, `Blank ${i + 1}`), h('div', { html: fillBoxes(pat, arr[i]) })));
    });
  } else {
    const txt = typeof a === 'string' ? a : '';
    card.append(txt.trim() ? h('div', { class: 'sv-open' }, txt) : h('p', { class: 'sv-none' }, '(no answer)'));
    if (o.marking && m && m.comment) card.append(h('div', { class: 'sv-comment' }, h('b', {}, 'Comment: '), m.comment));
  }
  return card;
}

// ---------------------------------------------------------------- images for the export (data URLs)
const dataUrlCache = new Map();
function imageDataUrl(examId, name) {
  const key = examId + '/' + name;
  if (!dataUrlCache.has(key)) {
    dataUrlCache.set(key, fetch(`/api/exams/${encodeURIComponent(examId)}/images/${encodeURIComponent(name)}`,
      { credentials: 'same-origin', headers: { 'X-Requested-With': 'seb-exams' } })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((b) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); }))
      .catch((e) => { dataUrlCache.delete(key); throw e; }));
  }
  return dataUrlCache.get(key);
}
let cssText = null;
async function viewerCss() {
  if (cssText === null) {
    const r = await fetch(CSS_URL);
    if (!r.ok) throw new Error('Could not load the style sheet (HTTP ' + r.status + ')');
    cssText = await r.text();
  }
  return cssText;
}
const fileSafe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'student';

function htmlDoc(title, css, bodyHtml) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${esc1(title)}</title>\n<link rel="stylesheet" href="${KATEX_CSS}">\n<style>\nbody{margin:0;padding:16px;background:#f6f7f9}\n${css}\n</style></head>\n<body>\n${bodyHtml}\n</body></html>\n`;
}

// ---------------------------------------------------------------- tab
export async function render(body, ex) {
  ensureCss();
  const data = await api(`/api/exams/${encodeURIComponent(ex.id)}/results`);
  const questions = data.questions || (ex.content && ex.content.questions) || [];
  const subs = (data.submissions || []).slice().sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)) || a.id - b.id);
  const ctx = {
    ex, questions, qmap: new Map(questions.map((q) => [q.id, q])),
    max: round(questions.reduce((t, q) => t + (Number(q.points) || 0), 0)),
    number: new Map(subs.map((s, i) => [s.id, i + 1])),  // "Student N" = position in submission order
  };
  const root = h('div', { class: 'sv-root' });
  body.append(root);
  const selected = new Set();

  // ---- list
  function showList() {
    root.replaceChildren();
    if (!subs.length) { root.append(h('p', { class: 'hint' }, 'No submissions yet.')); return; }
    const viewSel = h('button', { type: 'button', class: 'sv-viewsel', onclick: () => showViewer(subs.filter((s) => selected.has(s.id))) }, 'View selected');
    const selAll = h('button', { type: 'button', class: 'secondary sv-selall', onclick: () => {
      if (selected.size === subs.length) selected.clear(); else subs.forEach((s) => selected.add(s.id));
      boxes.forEach((b, i) => (b.checked = selected.has(subs[i].id))); sync();
    } }, 'Select all');
    const count = h('span', { class: 'hint sv-count' });
    const boxes = subs.map((s) => h('input', { type: 'checkbox', class: 'sv-pick', 'aria-label': `Select ${s.name}`, checked: selected.has(s.id),
      onchange: (ev) => { if (ev.target.checked) selected.add(s.id); else selected.delete(s.id); sync(); } }));
    const headBox = h('input', { type: 'checkbox', 'aria-label': 'Select all', class: 'sv-pickall', onchange: (ev) => {
      if (ev.target.checked) subs.forEach((s) => selected.add(s.id)); else selected.clear();
      boxes.forEach((b, i) => (b.checked = selected.has(subs[i].id))); sync();
    } });
    function sync() {
      const all = selected.size === subs.length;
      viewSel.disabled = !selected.size;
      selAll.textContent = all ? 'Select none' : 'Select all';
      headBox.checked = all; headBox.indeterminate = !all && selected.size > 0;
      count.textContent = `${selected.size} of ${subs.length} selected`;
    }
    root.append(h('div', { class: 'card sv-bar' },
      h('span', {}, h('strong', {}, String(subs.length)), subs.length === 1 ? ' submission' : ' submissions'),
      h('span', { class: 'row sv-actions' }, count, selAll, viewSel,
        h('button', { type: 'button', class: 'sv-viewall', onclick: () => showViewer(subs) }, 'View all'))));
    const rows = subs.map((s, i) => h('tr', {}, h('td', {}, boxes[i]), h('td', { class: 'nw' }, String(ctx.number.get(s.id))), h('td', {}, s.name),
      h('td', { class: 'nw' }, s.student_id), h('td', { class: 'nw' }, fmtTime(s.submitted_at)),
      h('td', {}, s.late ? h('span', { class: 'badge closed', title: 'Submitted after the end time' }, 'late') : ''),
      h('td', { class: 'nw' }, `${round(Number(s.total) || 0)} / ${ctx.max}`),
      h('td', {}, h('button', { type: 'button', class: 'secondary small sv-view', onclick: () => showViewer([s]) }, 'View'))));
    root.append(h('div', { class: 'tablewrap' }, h('table', { class: 'sv-table' },
      h('thead', {}, h('tr', {}, h('th', {}, headBox), ...['#', 'Name', 'Student ID', 'Submitted', 'Late', 'Total', ''].map((c) => h('th', {}, c)))),
      h('tbody', {}, rows))));
    sync();
  }

  // ---- viewer
  function showViewer(list) {
    root.replaceChildren();
    const status = h('span', { class: 'hint sv-status', role: 'status' });
    const order = h('select', { 'aria-label': 'Order', class: 'sv-order', onchange: () => { opts.order = order.value; draw(); } },
      h('option', { value: 'file' }, 'Exam file order'), h('option', { value: 'seen' }, 'As the student saw it'));
    order.value = opts.order;
    const marking = h('input', { type: 'checkbox', class: 'sv-marking', checked: opts.marking, onchange: () => { opts.marking = marking.checked; draw(); } });
    const anon = h('input', { type: 'checkbox', class: 'sv-anon', checked: opts.anon, onchange: () => { opts.anon = anon.checked; draw(); } });
    const zipBtn = h('button', { type: 'button', class: 'secondary sv-zip', onclick: () => exportZip(zipBtn) }, 'Download zip');
    const toolbar = h('div', { class: 'sv-toolbar' },
      h('button', { type: 'button', class: 'secondary small sv-back', onclick: showList }, '← List'),
      h('span', { class: 'hint' }, `${list.length} ${list.length === 1 ? 'submission' : 'submissions'}`),
      h('label', { class: 'sv-ctl' }, 'Order ', order),
      h('label', { class: 'sv-ctl' }, marking, ' Show marking'),
      h('label', { class: 'sv-ctl' }, anon, ' Anonymise'),
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'secondary sv-print', onclick: () => window.print() }, 'Print / Save as PDF'),
      zipBtn, status);
    const viewer = h('div', { class: 'sv-viewer' });
    root.append(toolbar, viewer);

    function draw() {
      const y = window.scrollY;
      viewer.replaceChildren(...list.map((s) => buildSub(ctx, s, opts, (im, name) => setImg(im, ex.id, name))));
      window.scrollTo(0, y);
    }
    async function exportZip(btn) {
      btn.disabled = true; status.textContent = 'Preparing …'; status.classList.remove('bad');
      try {
        const names = [...new Set(questions.filter((q) => q.image).map((q) => q.image))];
        const urls = new Map();
        await Promise.all(names.map(async (nm) => { try { urls.set(nm, await imageDataUrl(ex.id, nm)); } catch (e) { /* image stays missing */ } }));
        const css = await viewerCss();
        const files = {}, used = new Set();
        for (const s of list) {
          const el = buildSub(ctx, s, opts, (im, name) => { if (urls.has(name)) im.src = urls.get(name); });
          const label = opts.anon ? `Student ${ctx.number.get(s.id)}` : `${s.name || ''} (${s.student_id || ''})`;
          let base = opts.anon ? `student-${ctx.number.get(s.id)}` : fileSafe(s.student_id);
          let fname = base + '.html';
          for (let k = 2; used.has(fname.toLowerCase()); k++) fname = `${base}-${k}.html`;
          used.add(fname.toLowerCase());
          files[fname] = window.fflate.strToU8(htmlDoc(`${ctx.ex.content.title || ex.id} – ${label}`, css, el.outerHTML));
        }
        download(slug(ex.content.title || ex.id) + (opts.anon ? '-submissions-anonymous' : '-submissions') + '.zip', [window.fflate.zipSync(files)], 'application/zip');
        status.textContent = `${list.length} ${list.length === 1 ? 'file' : 'files'} saved`;
      } catch (e) { status.textContent = 'Export failed: ' + e.message; status.classList.add('bad'); }
      btn.disabled = false;
    }
    draw();
    window.scrollTo(0, 0);
  }

  showList();
}
