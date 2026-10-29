import { api } from './api.js';
import { h, fmtTime, download, slug, msg } from './util.js';

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const round = (x) => Math.round(x * 100) / 100;

function answerText(q, a) {
  if (a === undefined || a === null || a === '') return '';
  if (q.type === 'mc') {
    const i = (q.options || []).findIndex((_, k) => String.fromCharCode(97 + k) === a);
    return i < 0 ? String(a) : `${String.fromCharCode(65 + i)}) ${(q.options[i].text || '').replace(/\s+/g, ' ').trim()}`;
  }
  if (q.type === 'fill') return (Array.isArray(a) ? a : [a]).join(' | ');
  return String(a);
}
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};

export function buildCsv(questions, subs) {
  const head = ['Name', 'Student ID', 'Started', 'Submitted', 'Late', 'Minutes used', 'Receipt', 'SEB check'];
  questions.forEach((q, i) => {
    head.push(`Q${i + 1} answer`, `Q${i + 1} points (${q.type === 'open' ? 'manual' : 'auto'}, max ${q.points})`);
    if (q.type === 'open') head.push(`Q${i + 1} comment`);
  });
  head.push('Auto score', 'Auto max', 'Manual score', 'Manual max', 'Total', 'Max total');
  const rows = [head];
  for (const s of subs) {
    const man = s.manual || {}, det = s.detail || {};
    const r = [s.name, s.student_id, s.started_at, s.submitted_at, s.late ? 'late' : '', s.minutes_used, s.receipt, s.seb_check];
    let msum = 0;
    questions.forEach((q) => {
      const a = (s.answers || {})[q.id];
      r.push(answerText(q, a));
      if (q.type === 'open') {
        const m = man[q.id] || {};
        if (m.points != null) msum += num(m.points);
        r.push(m.points ?? '', m.comment ?? '');
      } else r.push(det[q.id] ? det[q.id].points : '');
    });
    const mmax = questions.filter((q) => q.type === 'open').reduce((t, q) => t + num(q.points), 0);
    r.push(s.auto_score, s.auto_max, round(msum), mmax, round(num(s.auto_score) + msum), round(num(s.auto_max) + mmax));
    rows.push(r);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export async function render(root, ex) {
  const data = await api(`/api/exams/${encodeURIComponent(ex.id)}/results`);
  const qs = data.questions || [], subs = data.submissions || [];
  const openMax = qs.filter((q) => q.type === 'open').reduce((t, q) => t + num(q.points), 0);
  root.append(h('div', { class: 'card row between' }, h('span', {}, h('strong', {}, String(subs.length)), subs.length === 1 ? ' submission' : ' submissions'),
    h('span', { class: 'row' }, h('button', { class: 'secondary', onclick: () => location.reload() }, 'Refresh'),
      h('button', { disabled: !subs.length, onclick: () => download(slug(ex.content.title) + '-results.csv', [buildCsv(qs, subs)], 'text/csv;charset=utf-8') }, 'Download CSV'))));
  if (!subs.length) { root.append(h('p', { class: 'hint' }, 'No submissions yet.')); return; }

  const heads = ['Name', 'Student ID', 'Submitted', 'Min.'];
  const ths = [...heads.map((c) => h('th', {}, c)),
    ...qs.map((q, i) => h('th', { title: q.type }, `Q${i + 1} `, h('span', { class: 'hint' }, `${q.type}, ${q.points}`))),
    ...['Auto', 'Manual', 'Total', 'Receipt', 'SEB', ''].map((c) => h('th', {}, c))];
  const tbody = h('tbody', {});
  for (const s of subs) {
    const man = s.manual = s.manual || {};
    const totalCell = h('td', { class: 'nw tot' }), manualCell = h('td', { class: 'nw' });
    const recompute = () => {
      const m = Object.values(man).reduce((t, x) => t + (x && x.points != null ? num(x.points) : 0), 0);
      manualCell.textContent = `${round(m)} / ${openMax}`;
      totalCell.textContent = `${round(num(s.auto_score) + m)} / ${round(num(s.auto_max) + openMax)}`;
    };
    const cells = qs.map((q) => {
      const a = (s.answers || {})[q.id], d = (s.detail || {})[q.id];
      if (q.type !== 'open') {
        const t = answerText(q, a);
        return h('td', { class: d ? (d.ok ? 'ok' : 'bad') : '' }, t ? h('div', { class: 'ans', title: t }, t) : '–', d ? h('div', { class: 'hint' }, `${d.points} pt`) : null);
      }
      const m = man[q.id] || {};
      const pts = h('input', { type: 'number', min: 0, max: q.points, step: 'any', class: 'num', value: m.points ?? '', 'aria-label': 'points' });
      const com = h('input', { type: 'text', class: 'cmt', value: m.comment ?? '', placeholder: 'comment', 'aria-label': 'comment' });
      const st = h('span', { class: 'hint' }, `/ ${q.points}`);
      const save = async () => {
        const v = pts.value === '' ? null : Number(pts.value);
        if (v !== null && (!(v >= 0) || v > num(q.points))) { st.textContent = `0..${q.points}!`; st.className = 'bad'; return; }
        st.textContent = 'saving …'; st.className = 'hint';
        try {
          await api(`/api/submissions/${s.id}/manual`, { method: 'PUT', body: { qid: q.id, points: v, comment: com.value } });
          man[q.id] = { points: v, comment: com.value }; recompute();
          st.textContent = `/ ${q.points} saved ✓`;
        } catch (e) { st.textContent = 'not saved: ' + e.message; st.className = 'bad'; }
      };
      pts.addEventListener('change', save); com.addEventListener('change', save);
      const full = h('div', { class: 'open' }, a ? String(a) : '–');
      full.addEventListener('click', () => full.classList.toggle('full'));
      return h('td', { class: 'opencell' }, full, h('div', { class: 'row tight' }, pts, st), com);
    });
    recompute();
    tbody.append(h('tr', {}, h('td', {}, s.name), h('td', { class: 'nw' }, s.student_id),
      h('td', { class: 'nw' }, fmtTime(s.submitted_at), s.late ? h('span', { class: 'badge closed', title: 'Submitted after the end time' }, 'late') : null),
      h('td', {}, s.minutes_used == null ? '' : String(s.minutes_used)), ...cells,
      h('td', { class: 'nw' }, `${s.auto_score} / ${s.auto_max}`), manualCell, totalCell,
      h('td', { class: 'nw mono' }, s.receipt || ''), h('td', { class: 'nw' }, s.seb_check == null ? '' : String(s.seb_check)),
      h('td', {}, h('button', { class: 'danger small', onclick: async () => {
        if (!confirm(`Delete the submission of ${s.name} (${s.student_id})? The student could then retake the exam.`)) return;
        try { await api('/api/submissions/' + s.id, { method: 'DELETE' }); location.reload(); } catch (e) { alert(e.message); }
      } }, 'Delete'))));
  }
  root.append(h('div', { class: 'tablewrap', id: 'restable' }, h('table', { class: 'results' }, h('thead', {}, h('tr', {}, ths)), tbody)),
    h('p', { class: 'hint' }, 'Open answers: type points (0 to the maximum) and an optional comment; each change is saved immediately. Click an answer to expand it.'));
}
