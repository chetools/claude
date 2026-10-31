// Grade tab: manual grading of open questions, anonymous by default.
// Desktop (>= 768 px): list grouped by question or by student. Phone: one card at a time with a slider.
import { api, ApiError, setImg } from './api.js';
import { h, msg } from './util.js';
import { renderMd } from './render.js';
import { setWidth } from './app.js';

// ------------------------------------------------------------------ helpers
// Seeded RNG (mulberry32 over an xmur3-style string hash) and Fisher-Yates shuffle: the same order on every visit.
function seedFrom(str) {
  let hh = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { hh = Math.imul(hh ^ str.charCodeAt(i), 3432918353); hh = (hh << 13) | (hh >>> 19); }
  hh = Math.imul(hh ^ (hh >>> 16), 2246822507); hh = Math.imul(hh ^ (hh >>> 13), 3266489909);
  return (hh ^= hh >>> 16) >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededShuffle(arr, seedStr) {
  const out = arr.slice(), r = rng(seedFrom(seedStr));
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};
const fmt = (x) => (x == null ? '–' : String(Math.round(x * 100) / 100));
const validPoints = (v, max) => Number.isFinite(v) && v >= 0 && v <= max && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
const isDesktop = () => window.matchMedia('(min-width: 768px)').matches;
const PREFS_DEFAULT = { names: false, group: 'question', filter: true, order: 'student' };

let active = null; // the live instance, so a re-render disposes the previous one's timers

export async function render(body, ex) {
  if (!document.getElementById('grade-css')) {
    document.head.append(h('link', { id: 'grade-css', rel: 'stylesheet', href: new URL('../css/grade.css', import.meta.url).href }));
  }
  try { setWidth('mid'); } catch (e) { /* ignore */ }
  if (active) active.dispose();
  const id = ex.id;
  const data = await api(`/api/exams/${encodeURIComponent(id)}/results`);
  const allQ = data.questions || [];
  const qs = allQ.map((q, i) => ({ ...q, no: i + 1 })).filter((q) => q.type === 'open');
  if (!qs.length) { body.append(msg('ok', 'This exam has no open questions, so there is nothing to grade by hand. Multiple choice and fill-in questions are marked automatically.')); return; }
  const subsRaw = (data.submissions || []).slice().sort((a, b) => a.id - b.id);
  if (!subsRaw.length) { body.append(h('p', { class: 'hint' }, 'No submissions yet. Answers will appear here once students have submitted.')); return; }
  const subs = seededShuffle(subsRaw, 'grade:' + id);
  subs.forEach((s, i) => { s.label = 'Student ' + (i + 1); s.manual = s.manual || {}; });
  const subById = new Map(subs.map((s) => [s.id, s]));

  const prefKey = `sebgrade:${id}:prefs`, queueKey = `sebgrade:${id}:queue`;
  const prefs = { ...PREFS_DEFAULT, ...(store.get(prefKey, {}) || {}) };
  const savePrefs = () => store.set(prefKey, prefs);

  // ---- state
  const stay = new Set();              // cards graded in this view stay visible until the filter is toggled
  const statusEls = new Map();         // key -> [status elements]
  const progressEls = new Map();       // qid -> [progress elements]
  const key = (s, q) => `${s.id}:${q.id}`;
  const pointsOf = (s, q) => { const m = s.manual[q.id]; return m && m.points != null ? Number(m.points) : null; };
  const commentOf = (s, q) => { const m = s.manual[q.id]; return (m && m.comment) || ''; };
  const isGraded = (s, q) => pointsOf(s, q) != null;
  const visible = (s, q) => !prefs.filter || !isGraded(s, q) || stay.has(key(s, q));
  const gradedCount = (q) => subs.filter((s) => isGraded(s, q)).length;
  const answerOf = (s, q) => { const a = (s.answers || {})[q.id]; return a == null ? '' : String(a); };

  // ---- save queue
  let queue = {};                      // key -> {sid, qid, points, comment, seq}
  const loadQueue = () => {
    const raw = store.get(queueKey, []);
    for (const e of Array.isArray(raw) ? raw : []) {
      const s = subById.get(e.sid), q = qs.find((x) => x.id === e.qid);
      if (!s || !q) continue;
      queue[`${e.sid}:${e.qid}`] = { ...e, seq: 0, prev: s.manual[e.qid] ? { ...s.manual[e.qid] } : undefined };
      s.manual[e.qid] = { points: e.points, comment: e.comment };
    }
  };
  const persistQueue = () => store.set(queueKey, Object.values(queue).map(({ sid, qid, points, comment }) => ({ sid, qid, points, comment })));
  let seqCounter = 1, flushing = false, disposed = false;
  const badge = h('span', { class: 'gr-pending hidden', role: 'status', 'aria-live': 'polite' });
  const updateBadge = () => {
    const n = Object.keys(queue).length;
    badge.classList.toggle('hidden', !n);
    badge.textContent = n ? `${n} unsaved – retrying` : '';
    badge.title = n ? 'These grades are stored in this browser and will be sent as soon as the connection works.' : '';
  };
  const setStatus = (k, text, cls) => {
    for (const el of statusEls.get(k) || []) { if (!el.isConnected) continue; el.textContent = text; el.className = 'gr-status ' + (cls || ''); }
  };
  const retriable = (e) => !(e instanceof ApiError) || e.status >= 500 || e.status === 429 || e.status === 408 || e.status === 401;
  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      for (const k of Object.keys(queue)) {
        const e = queue[k];
        if (!e) continue;
        const seq = e.seq;
        try {
          await api(`/api/submissions/${e.sid}/manual`, { method: 'PUT', body: { qid: e.qid, points: e.points, comment: e.comment } });
          if (queue[k] && queue[k].seq === seq) { delete queue[k]; setStatus(k, 'Saved ✓', 'ok'); }
        } catch (err) {
          if (retriable(err)) { setStatus(k, 'Not saved yet – will retry', 'warn'); break; }
          // permanent rejection (for example 422): revert to what the server has and show the reason
          const s = subById.get(e.sid);
          if (s && queue[k] && queue[k].seq === seq) {
            if (e.prev) s.manual[e.qid] = e.prev; else delete s.manual[e.qid];
            delete queue[k];
            setStatus(k, 'Rejected: ' + err.message, 'bad');
            onChanged(s, qs.find((x) => x.id === e.qid), true);
          }
        }
      }
    } finally {
      flushing = false; persistQueue(); updateBadge();
    }
  }
  const timer = setInterval(() => {
    if (disposed) return;
    if (!Object.keys(queue).length) { if (!body.isConnected && wasConnected) dispose(); return; }
    flush();
  }, 10000);
  const onOnline = () => flush();
  window.addEventListener('online', onOnline);
  let wasConnected = false;
  function dispose() { disposed = true; clearInterval(timer); window.removeEventListener('online', onOnline); mq.removeEventListener('change', onMq); if (active === inst) active = null; }
  const inst = { dispose };
  active = inst;

  // Record a grade locally at once, then send it (or queue it).
  function save(s, q, points, comment) {
    const k = key(s, q), cur = s.manual[q.id];
    if (cur && (cur.points ?? null) === points && (cur.comment || '') === comment) return;
    if (!cur && points === null && !comment) return;
    const prev = queue[k] ? queue[k].prev : (cur ? { ...cur } : undefined);
    s.manual[q.id] = { points, comment };
    queue[k] = { sid: s.id, qid: q.id, points, comment, seq: seqCounter++, prev };
    if (points != null) stay.add(k);
    persistQueue(); updateBadge();
    setStatus(k, 'Saving …', 'hint');
    onChanged(s, q);
    flush();
  }
  function onChanged(s, q) {
    for (const el of progressEls.get(q.id) || []) if (el.isConnected) el.textContent = `${gradedCount(q)} of ${subs.length} graded`;
    if (!isDesktop()) paintMobileMeta();
  }
  const register = (map, k, el) => { if (!map.has(k)) map.set(k, []); map.get(k).push(el); return el; };
  const nameOf = (s) => (prefs.names ? `${s.name || ''}${s.student_id ? ' (' + s.student_id + ')' : ''}`.trim() || s.label : s.label);

  // ---- shared pieces
  const qText = (q, small) => {
    const d = h('div', { class: 'md gr-qtext' + (small ? ' small' : ''), html: renderMd(q.text) });
    const fig = q.image ? h('div', { class: 'figure' }, setImg(h('img', { alt: q.image_alt || '' }), id, q.image)) : null;
    return h('div', {}, d, fig);
  };
  const progress = (q) => register(progressEls, q.id, h('span', { class: 'gr-progress' }, `${gradedCount(q)} of ${subs.length} graded`));
  const answerBox = (s, q) => {
    const a = answerOf(s, q);
    return a.trim() ? h('div', { class: 'gr-answer', tabindex: 0, 'aria-label': `Answer of ${prefs.names ? nameOf(s) : s.label}` }, a)
      : h('div', { class: 'gr-answer empty' }, 'No answer');
  };

  // ---- toolbar
  const toggleCheck = (label, prop, after) => {
    const cb = h('input', { type: 'checkbox', checked: !!prefs[prop], onchange: () => { prefs[prop] = cb.checked; savePrefs(); after(); } });
    return h('label', { class: 'gr-check' }, cb, ' ', label);
  };
  const seg = (name, prop, options, after) => {
    const wrap = h('span', { class: 'gr-seg', role: 'group', 'aria-label': name });
    for (const [v, text] of options) {
      wrap.append(h('button', { type: 'button', class: 'gr-segbtn' + (prefs[prop] === v ? ' on' : ''), 'aria-pressed': prefs[prop] === v ? 'true' : 'false',
        onclick: () => { prefs[prop] = v; savePrefs(); after(); } }, text));
    }
    return wrap;
  };
  const toolbar = () => {
    const bar = h('div', { class: 'gr-toolbar' });
    const rerun = () => { stay.clear(); draw(); };
    const row = h('div', { class: 'gr-toolrow' },
      toggleCheck('Show names', 'names', () => draw()),
      toggleCheck('Ungraded only', 'filter', rerun));
    if (isDesktop()) {
      row.append(h('span', { class: 'gr-lbl' }, 'Group by'), seg('Group by', 'group', [['question', 'Question'], ['student', 'Student']], () => draw()));
    } else {
      row.append(h('span', { class: 'gr-lbl' }, 'Next'), seg('Order', 'order', [['student', 'Next student'], ['question', 'Next question']], () => draw()));
    }
    row.append(h('span', { class: 'grow' }), badge);
    bar.append(row);
    return bar;
  };

  // ================================================================== desktop
  const gradeBox = (s, q) => {
    const k = key(s, q);
    const lab = `${prefs.names ? nameOf(s) : s.label}, question ${q.no}`;
    const inp = h('input', { type: 'number', class: 'gin', step: 0.5, min: 0, max: q.points, inputmode: 'decimal',
      value: pointsOf(s, q) ?? '', 'aria-label': `Points for ${lab} (max ${q.points})`, 'data-key': k });
    const com = h('input', { type: 'text', class: 'gcom', value: commentOf(s, q), placeholder: 'Comment (optional)', 'aria-label': `Comment for ${lab}`, maxlength: 2000 });
    const err = h('div', { class: 'gr-err', role: 'alert' });
    const st = register(statusEls, k, h('span', { class: 'gr-status' }, isGraded(s, q) ? 'Saved ✓' : ''));
    if (queue[k]) st.textContent = 'Not saved yet – will retry', st.className = 'gr-status warn';
    const commit = () => {
      const raw = inp.value.trim();
      let v = null;
      if (raw !== '') {
        v = Number(raw);
        if (!validPoints(v, q.points)) {
          inp.classList.add('invalid'); inp.setAttribute('aria-invalid', 'true');
          err.textContent = `Enter a multiple of 0.5 from 0 to ${q.points}.`;
          return false;
        }
      }
      inp.classList.remove('invalid'); inp.removeAttribute('aria-invalid'); err.textContent = '';
      save(s, q, v, com.value.trim());
      return true;
    };
    const next = () => {
      const all = [...body.querySelectorAll('input.gin')], i = all.indexOf(inp);
      const n = all[i + 1];
      if (n) { n.focus(); n.select(); n.scrollIntoView({ block: 'center', behavior: 'smooth' }); } else inp.blur();
    };
    const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (commit()) next(); } };
    inp.addEventListener('keydown', onKey); com.addEventListener('keydown', onKey);
    inp.addEventListener('change', commit); com.addEventListener('change', commit);
    inp.addEventListener('input', () => { if (inp.classList.contains('invalid')) { inp.classList.remove('invalid'); inp.removeAttribute('aria-invalid'); err.textContent = ''; } });
    return h('div', { class: 'gr-gradebox' },
      h('div', { class: 'gr-pts' }, inp, h('span', { class: 'gr-max' }, `/ ${q.points}`), st), err, com);
  };
  const deskCard = (s, q, showQ) => h('article', { class: 'gr-card', 'data-key': key(s, q) },
    h('div', { class: 'gr-answercol' },
      h('div', { class: 'gr-who' }, showQ ? h('span', { class: 'gr-qno' }, `Q${q.no}`) : null, h('strong', {}, nameOf(s))),
      showQ ? h('details', { class: 'gr-qdet' }, h('summary', {}, 'Question'), qText(q, true)) : null,
      answerBox(s, q)),
    gradeBox(s, q));

  function drawDesktop(host) {
    host.append(h('nav', { class: 'gr-summary', 'aria-label': 'Progress' },
      qs.map((q) => h('span', { class: 'gr-sumitem' }, h('strong', {}, `Q${q.no}`), ' ', progress(q)))));
    const empty = () => h('p', { class: 'gr-done' }, prefs.filter ? 'Every answer here is graded. Untick “Ungraded only” to see them.' : 'No answers.');
    if (prefs.group === 'question') {
      for (const q of qs) {
        const sec = h('section', { class: 'gr-group', 'aria-label': `Question ${q.no}` },
          h('header', { class: 'gr-ghead' }, h('h3', {}, `Question ${q.no}`, h('span', { class: 'gr-ptsmax' }, `${q.points} ${q.points === 1 ? 'point' : 'points'}`)), progress(q)),
          qText(q));
        const list = subs.filter((s) => visible(s, q));
        if (!list.length) sec.append(empty()); else list.forEach((s) => sec.append(deskCard(s, q, false)));
        host.append(sec);
      }
    } else {
      for (const s of subs) {
        const list = qs.filter((q) => visible(s, q));
        if (!list.length) continue;
        const sec = h('section', { class: 'gr-group', 'aria-label': nameOf(s) }, h('header', { class: 'gr-ghead' }, h('h3', {}, nameOf(s))));
        list.forEach((q) => sec.append(deskCard(s, q, true)));
        host.append(sec);
      }
      if (!host.querySelector('.gr-group')) host.append(empty());
    }
  }

  // ================================================================== phone
  let curKey = null;                   // key of the card shown
  let mobileRefs = null;
  const orderedCards = () => {
    const all = [];
    if (prefs.order === 'question') for (const s of subs) for (const q of qs) all.push([s, q]);
    else for (const q of qs) for (const s of subs) all.push([s, q]);
    return all;
  };
  const visibleCards = () => orderedCards().filter(([s, q]) => visible(s, q));
  function paintMobileMeta() {
    if (!mobileRefs) return;
    const list = visibleCards();
    const i = list.findIndex(([s, q]) => key(s, q) === curKey);
    const [, q] = list[i] || [];
    if (mobileRefs.pos) mobileRefs.pos.textContent = i >= 0 ? `Answer ${i + 1} of ${list.length}` : '';
    mobileRefs.opts.forEach((o) => { o.textContent = `Q${o.q.no} · ${gradedCount(o.q)} of ${subs.length} graded`; });
    if (q && mobileRefs.picker) mobileRefs.picker.value = q.id;
  }
  function drawMobile(host) {
    const list = visibleCards();
    mobileRefs = { opts: [] };
    if (!list.length) {
      host.append(h('div', { class: 'gr-card mob' }, h('p', { class: 'gr-done' }, 'All answers are graded.'),
        h('button', { type: 'button', onclick: () => { prefs.filter = false; savePrefs(); stay.clear(); draw(); } }, 'Show graded answers too')));
      return;
    }
    let i = list.findIndex(([s, q]) => key(s, q) === curKey);
    if (i < 0) i = 0;
    const [s, q] = list[i];
    curKey = key(s, q);
    const k = curKey;

    const picker = h('select', { class: 'gr-picker', 'aria-label': 'Question', onchange: () => {
      const target = qs.find((x) => x.id === picker.value);
      const same = prefs.order === 'question' ? list.find(([ss, qq]) => qq === target && ss === s) : null;
      const hit = same || list.find(([, qq]) => qq === target);
      if (hit) { curKey = key(hit[0], hit[1]); draw(); } else { picker.value = q.id; }
    } });
    qs.forEach((x) => { const o = h('option', { value: x.id }); o.q = x; mobileRefs.opts.push(o); picker.append(o); });
    mobileRefs.picker = picker;
    const pos = h('div', { class: 'gr-pos', 'aria-live': 'polite' });
    mobileRefs.pos = pos;

    const go = (d) => {
      const n = list[i + d];
      if (!n) return;
      curKey = key(n[0], n[1]); draw();
      window.scrollTo({ top: 0 });
    };
    const prevBtn = h('button', { type: 'button', class: 'gr-nav secondary', 'aria-label': 'Previous answer', disabled: i === 0, onclick: () => go(-1) }, '‹');
    const nextBtn = h('button', { type: 'button', class: 'gr-nav secondary', 'aria-label': 'Next answer', disabled: i === list.length - 1, onclick: () => go(1) }, '›');

    const cur = pointsOf(s, q);
    const big = h('div', { class: 'gr-big', 'aria-live': 'polite' }, h('span', { class: 'v' }, fmt(cur)), h('span', { class: 'of' }, ` / ${q.points}`));
    const slider = h('input', { type: 'range', class: 'gr-slider', min: 0, max: q.points, step: 0.5, value: cur ?? 0,
      'aria-label': `Points for ${prefs.names ? nameOf(s) : s.label}, question ${q.no} (max ${q.points})`, 'data-key': k });
    const com = h('textarea', { class: 'gr-comment', rows: 2, placeholder: 'Comment (optional)', 'aria-label': `Comment for ${prefs.names ? nameOf(s) : s.label}, question ${q.no}`, maxlength: 2000 }, commentOf(s, q));
    com.value = commentOf(s, q);
    const st = register(statusEls, k, h('span', { class: 'gr-status' }, isGraded(s, q) ? 'Saved ✓' : ''));
    if (queue[k]) st.textContent = 'Not saved yet – will retry', st.className = 'gr-status warn';
    let touched = cur != null;
    slider.addEventListener('input', () => { touched = true; big.querySelector('.v').textContent = fmt(Number(slider.value)); });
    const commitSlider = () => {
      if (!touched) return;
      const v = Number(slider.value);
      if (validPoints(v, q.points)) save(s, q, v, com.value.trim());
    };
    slider.addEventListener('change', commitSlider);
    slider.addEventListener('pointerup', commitSlider);
    com.addEventListener('change', () => { save(s, q, pointsOf(s, q), com.value.trim()); });

    const card = h('article', { class: 'gr-card mob', 'data-key': k },
      h('div', { class: 'gr-who' }, h('strong', {}, nameOf(s)), h('span', { class: 'gr-qno' }, `Q${q.no}`)),
      h('details', { class: 'gr-qdet' }, h('summary', {}, 'Question'), qText(q, true)),
      answerBox(s, q),
      h('div', { class: 'gr-sliderbox' }, big, slider,
        h('div', { class: 'gr-ticks' }, h('span', {}, '0'), h('span', {}, String(q.points))), st),
      com);
    attachSwipe(card, go);

    host.append(
      h('div', { class: 'gr-pickrow' }, h('label', { for: 'gr-picker' }, 'Question'), picker),
      card,
      h('div', { class: 'gr-navrow' }, prevBtn, pos, nextBtn));
    picker.id = 'gr-picker';
    paintMobileMeta();
  }
  function attachSwipe(el, go) {
    let sx = 0, sy = 0, on = false;
    el.addEventListener('pointerdown', (e) => {
      on = !e.target.closest('input, textarea, select, button, summary, a');
      sx = e.clientX; sy = e.clientY;
    });
    el.addEventListener('pointercancel', () => { on = false; });
    el.addEventListener('pointerup', (e) => {
      if (!on) return;
      on = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) >= 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
    });
  }

  // ================================================================== frame
  const host = h('div', { class: 'gr' });
  body.append(host);
  function draw() {
    const y = window.scrollY;
    statusEls.clear(); progressEls.clear(); mobileRefs = null;
    host.replaceChildren(toolbar());
    host.classList.toggle('desk', isDesktop()); host.classList.toggle('phone', !isDesktop());
    (isDesktop() ? drawDesktop : drawMobile)(host);
    if (isDesktop()) window.scrollTo({ top: y });
  }
  const mq = window.matchMedia('(min-width: 768px)');
  const onMq = () => { if (!disposed) draw(); };
  mq.addEventListener('change', onMq);
  new MutationObserver((_, ob) => { if (body.isConnected) { wasConnected = true; ob.disconnect(); } }).observe(document.documentElement, { childList: true, subtree: true });

  loadQueue(); updateBadge();
  draw();
  if (Object.keys(queue).length) flush();
}
