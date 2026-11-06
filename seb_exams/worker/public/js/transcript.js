// Transcript exams inside the teacher app: the exam list and the
// per-exam tabs (Exam, Roster, Results). Talks to /api/t/* (see api.js).
import { api } from './api.js';
import { h, msg, fmtTime, toLocalInput } from './util.js';
import { showBar } from './bar.js';

const pts = (frac, points) => (typeof frac === "number" ? String(Math.round(frac * points * 100) / 100) : "—");
const badge = (status) => h('span', { class: 'badge ' + status }, status);

export async function render(node, id, tab) {
  if (!id) return listView(node);
  return examView(node, id, tab || 'exam');
}

// ---- list ---------------------------------------------------------------------
async function listView(node) {
  showBar({ title: 'Transcript exams' });
  const out = h('div', {});
  const listBox = h('div', {});
  const draw = (exams) => {
    if (!exams.length) { listBox.replaceChildren(h('p', { class: 'hint' }, 'No transcript exams yet.')); return; }
    const rows = exams.map((e) => h('tr', {},
      h('td', {}, h('strong', {}, e.title), ' ', badge(e.status)),
      h('td', {}, 'Prompt version ' + e.prompt_version),
      h('td', {}, h('button', { class: 'secondary small', onclick: () => { location.hash = '#/texam/' + encodeURIComponent(e.id) + '/exam'; } }, 'Open'))));
    listBox.replaceChildren(h('div', { class: 'tablewrap' },
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Exam'), h('th', {}, ''), h('th', {}, ''))), h('tbody', {}, rows))));
  };
  const newBtn = h('button', { onclick: async () => {
    newBtn.disabled = true;
    try {
      const d = await api('/api/t/exams', { method: 'POST', body: {
        title: 'New transcript exam', app_url: 'https://chetools.github.io/muse/keypoints-app/',
        assignment: '', prompt: '', rubric: [],
        opens_at: null, closes_at: null } });
      location.hash = '#/texam/' + encodeURIComponent(d.id) + '/exam';
    } catch (e) { out.replaceChildren(msg('err', e.message)); newBtn.disabled = false; }
  } }, 'New transcript exam');
  node.append(
    h('div', { class: 'card' }, h('h2', {}, 'Your transcript exams'), listBox, h('div', { class: 'row' }, newBtn)),
    out);
  draw((await api('/api/t/exams')).exams);
}

// ---- one exam -----------------------------------------------------------------
const TABS = [['exam', 'Exam'], ['roster', 'Roster'], ['results', 'Results'], ['watch', 'Muse tokens']];
async function examView(node, id, tab) {
  const exam = (await api('/api/t/exams/' + encodeURIComponent(id))).exam;
  showBar({ title: exam.title || exam.id, badge: badge(exam.status),
    tabs: TABS.map(([k, label]) => ({ href: '#/texam/' + encodeURIComponent(id) + '/' + k, label, on: k === tab })) });
  node.append(h('p', {}, h('a', { href: '#/texams' }, '← Transcript exams')));
  if (tab === 'roster') return rosterTab(node, exam);
  if (tab === 'results') return resultsTab(node, exam);
  if (tab === 'watch') return watchTab(node, exam);
  return examTab(node, exam);
}

function examTab(node, exam) {
  const out = h('div', {});
  const title = h('input', { type: 'text', value: exam.title || '' });
  const appUrl = h('input', { type: 'text', value: exam.app_url || '' });
  const assign = h('input', { type: 'text', value: exam.assignment || '' });
  const opens = h('input', { type: 'datetime-local', value: toLocalInput(exam.opens_at) });
  const closes = h('input', { type: 'datetime-local', value: toLocalInput(exam.closes_at) });
  const prompt = h('textarea', { rows: 8, value: exam.prompt || '' });
  const tbody = h('tbody', {});
  const addRow = (r) => {
    const name = h('input', { type: 'text', value: r.name });
    const points = h('input', { type: 'number', class: 'num', value: r.points });
    const guidance = h('input', { type: 'text', value: r.guidance || '' });
    const tr = h('tr', {}, h('td', {}, name), h('td', {}, points), h('td', {}, guidance),
      h('td', {}, h('button', { class: 'secondary small', onclick: () => tr.remove() }, 'Remove')));
    tr._read = () => ({ name: name.value.trim(), points: Number(points.value), guidance: guidance.value });
    tbody.append(tr);
  };
  (exam.rubric || []).forEach(addRow);
  const body = () => ({ title: title.value, app_url: appUrl.value, assignment: assign.value,
    opens_at: opens.value ? new Date(opens.value).toISOString() : null,
    closes_at: closes.value ? new Date(closes.value).toISOString() : null,
    prompt: prompt.value,
    rubric: [...tbody.querySelectorAll('tr')].map((tr) => tr._read()).filter((r) => r.name) });
  const link = exam.app_url + '?exam=' + exam.id + '&server=' + location.origin;
  node.append(h('div', { class: 'card' },
    h('label', { class: 'field' }, 'Title', title),
    h('label', { class: 'field' }, 'Student app address', appUrl),
    h('label', { class: 'field' }, 'Assignment name the app reports', assign),
    h('div', { class: 'row' }, h('label', { class: 'field grow' }, 'Opens at', opens), h('label', { class: 'field grow' }, 'Closes at', closes)),
    h('label', { class: 'field' }, 'Grading prompt', prompt),
    h('div', { class: 'field' }, h('label', {}, 'Rubric'),
      h('p', { class: 'hint' }, 'Each element: a name, its points, and guidance on what counts. Grades are recorded as a fraction of each element and converted to points.'),
      h('div', { class: 'tablewrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Element'), h('th', {}, 'Points'), h('th', {}, 'Guidance'), h('th', {}, ''))), tbody)),
      h('button', { class: 'secondary small', onclick: () => addRow({ name: '', points: 5, guidance: '' }) }, 'Add element')),
    h('div', { class: 'row' },
      h('button', { onclick: async () => {
        out.replaceChildren();
        try { const d = await api('/api/t/exams/' + encodeURIComponent(exam.id), { method: 'PUT', body: body() });
          out.replaceChildren(msg('ok', 'Saved. Prompt version ' + d.prompt_version + '.')); }
        catch (e) { out.replaceChildren(msg('err', e.message)); }
      } }, 'Save exam'),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm('Delete this exam, its roster and all its transcripts and results?')) return;
        try { await api('/api/t/exams/' + encodeURIComponent(exam.id), { method: 'DELETE' }); location.hash = '#/texams'; }
        catch (e) { out.replaceChildren(msg('err', e.message)); }
      } }, 'Delete exam')),
    out,
    h('p', { class: 'hint' }, 'Give students this link (they sign in with the emailed link inside the app):'),
    h('p', { class: 'mono' }, link),
    h('h3', {}, 'Teacher\u2019s Muse token'),
    h('p', { class: 'hint' }, 'Your Muse uses this exam\u2019s audit token to set up the keypoints assignment: uploading the typeset page from your photographs, enrolling your model take, and uploading the answer key you approve. Students re-record as often as they like and their best graded attempt stands; no validation step runs on the server. Generating a token replaces the previous one. The token is shown once \u2014 store it where your Muse can read it, not in the exam record.'),
    h('div', { class: 'row' },
      h('button', { class: 'secondary small', onclick: async (ev) => {
        if (!confirm('Generate a new audit token for this exam? The previous token stops working.')) return;
        try { const d = await api('/api/t/exams/' + encodeURIComponent(exam.id) + '/audit-token', { method: 'POST', body: {} });
          ev.target.closest('.card').querySelector('.audit-token-out').textContent = d.token; }
        catch (e) { out.replaceChildren(msg('err', e.message)); }
      } }, exam.has_audit_token ? 'Replace audit token' : 'Generate audit token')),
    h('p', { class: 'mono audit-token-out' }, '')));
}

function rosterTab(node, exam) {
  const out = h('div', {});
  const ta = h('textarea', { rows: 12 });
  const refresh = async () => {
    const d = await api('/api/t/exams/' + encodeURIComponent(exam.id) + '/roster');
    ta.value = d.roster.map((r) => (r.name ? r.name + ', ' : '') + r.email).join('\n');
  };
  node.append(h('div', { class: 'card' },
    h('h2', {}, 'Roster'),
    h('p', { class: 'hint' }, 'One student per line, as Name, email. Only rostered students can sign in. Saving replaces the roster.'),
    ta,
    h('div', { class: 'row' }, h('button', { onclick: async () => {
      out.replaceChildren();
      try { const d = await api('/api/t/exams/' + encodeURIComponent(exam.id) + '/roster', { method: 'PUT', body: { csv: ta.value } });
        out.replaceChildren(msg('ok', 'Saved ' + d.count + ' students.')); }
      catch (e) { out.replaceChildren(msg('err', e.message)); }
    } }, 'Save roster')),
    out));
  refresh();
}

function watchTab(node, exam) {
  const out = h('div', {});
  const ta = h('textarea', { rows: 6 });
  const listBox = h('div', {});
  const base = '/api/t/exams/' + encodeURIComponent(exam.id) + '/watch-tokens';
  const checked = () => [...listBox.querySelectorAll('input.watch-check:checked')].map((c) => c.dataset.email);
  const act = async (fn, okText) => {
    out.replaceChildren();
    try { const d = await fn(); if (okText) out.replaceChildren(msg('ok', okText(d))); }
    catch (e) { out.replaceChildren(msg('err', e.message)); }
    refresh();
  };
  const refresh = async () => {
    const d = await api(base);
    if (!d.tokens.length) { listBox.replaceChildren(h('p', { class: 'hint' }, 'No watch tokens yet. Add students above.')); return; }
    const rows = d.tokens.map((r) => h('tr', {},
      h('td', {}, h('input', { type: 'checkbox', class: 'watch-check', 'data-email': r.email })),
      h('td', {}, (r.name ? r.name + ' — ' : '') + r.email),
      h('td', {}, r.status),
      h('td', { class: 'nw' }, fmtTime(r.created_at) || '—'),
      h('td', { class: 'nw' }, fmtTime(r.last_emailed_at) || '—'),
      h('td', { class: 'nw' }, fmtTime(r.last_poll_at) || '—'),
      h('td', { class: 'nw' }, fmtTime(r.last_pending_at) || '—'),
      h('td', {}, h('div', { class: 'row' },
        h('button', { class: 'secondary small', onclick: () => {
          if (!confirm('Regenerate the watch token and poll key for ' + r.email + '? The old ones stop working at once, and the student must set up again with the new ones (email them after regenerating).')) return;
          act(() => api(base + '/regenerate', { method: 'POST', body: { email: r.email } }), () => 'Regenerated for ' + r.email + '.');
        } }, 'Regenerate'),
        h('button', { class: 'secondary small', onclick: () =>
          act(async () => {
            const res = await api(base + '/email', { method: 'POST', body: { emails: [r.email] } });
            const row = res.results[0];
            if (row && row.error) throw new Error(row.error);
          }, () => 'Setup email sent to ' + r.email + '.') }, 'Email'),
        h('button', { class: 'secondary small', onclick: () => {
          if (!confirm('Delete the watch token for ' + r.email + '? Their Muse stops picking up takes at once.')) return;
          act(() => api(base, { method: 'DELETE', body: { email: r.email } }), () => 'Deleted for ' + r.email + '.');
        } }, 'Delete')))));
    listBox.replaceChildren(h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Student'), h('th', {}, 'Status'), h('th', {}, 'Created'),
        h('th', {}, 'Last emailed'), h('th', {}, 'Last poll'), h('th', {}, 'Last pending'), h('th', {}, ''))),
      h('tbody', {}, rows))));
  };
  node.append(h('div', { class: 'card' },
    h('h2', {}, 'Muse tokens'),
    h('p', { class: 'hint' }, 'One watch token and poll key per student for this exam. The student\u2019s Muse polls with the poll key every 60 seconds and grades sealed takes with the token. Tokens are stored encrypted on the server so the same setup email can be re-sent; they are never shown here.'),
    h('label', { class: 'field' }, 'Add students (one per line, as Name, email — students who already have a token are left unchanged)', ta),
    h('div', { class: 'row' }, h('button', { onclick: () =>
      act(async () => {
        const d = await api(base, { method: 'POST', body: { entries: ta.value } });
        ta.value = '';
        out.replaceChildren(msg('ok', 'Added ' + d.added + ', already had a token: ' + d.existing + '.'));
      }) }, 'Add')),
    listBox,
    h('div', { class: 'row' },
      h('button', { class: 'secondary', onclick: () => {
        const emails = checked();
        if (!emails.length) { out.replaceChildren(msg('err', 'Check at least one student first.')); return; }
        act(async () => {
          const res = await api(base + '/email', { method: 'POST', body: { emails } });
          const bad = res.results.filter((r) => r.error);
          out.replaceChildren(bad.length
            ? msg('err', 'Sent to ' + (res.results.length - bad.length) + '. Failed: ' + bad.map((r) => r.email + ' (' + r.error + ')').join('; '))
            : msg('ok', 'Setup email sent to ' + res.results.length + ' student(s).'));
        });
      } }, 'Email checked'),
      h('button', { class: 'secondary', onclick: () =>
        act(async () => {
          const res = await api(base + '/email', { method: 'POST', body: { all: true } });
          const bad = res.results.filter((r) => r.error);
          out.replaceChildren(bad.length
            ? msg('err', 'Sent to ' + (res.results.length - bad.length) + '. Failed: ' + bad.map((r) => r.email + ' (' + r.error + ')').join('; '))
            : msg('ok', 'Setup email sent to ' + res.results.length + ' student(s).'));
        }, null) }, 'Email all')),
    out));
  refresh();
}

function resultsTab(node, exam) {
  const listBox = h('div', {});
  const detail = h('div', {});
  const showDetail = (r) => {
    const rows = (exam.rubric || []).map((el) => {
      const s = r.grades ? r.grades[el.name] : undefined;
      const f = r.manual && r.manual.fractions && typeof r.manual.fractions[el.name] === 'number' ? r.manual.fractions[el.name] : s;
      const flagged = (r.flags || []).some((fl) => fl.element === el.name);
      const inp = h('input', { type: 'number', class: 'num', min: '0', max: '1', step: '0.05', value: typeof f === 'number' ? String(f) : '' });
      inp.dataset.name = el.name;
      return h('tr', flagged ? { style: 'background:var(--warn-bg)' } : {},
        h('td', {}, el.name + ' (' + el.points + ' points)'), h('td', {}, pts(s, el.points)),
        h('td', {}, inp));
    });
    const comment = h('input', { type: 'text', value: r.manual && r.manual.comment ? r.manual.comment : '' });
    const oOut = h('div', {});
    const audioKids = [];
    if (r.audio && r.audio.length) {
      audioKids.push(h('h4', {}, 'Sealed audio'));
      audioKids.push(h('p', { class: 'hint' }, 'Audio fingerprint: ' + (r.audio_fingerprint || '—')));
      for (const a of r.audio) {
        audioKids.push(h('p', {}, 'Slide ' + a.slide + (a.title ? ' — ' + a.title : '') + ' ',
          h('audio', { controls: 'controls', preload: 'none', src: '/api/t/exams/' + encodeURIComponent(exam.id) + '/results/' + encodeURIComponent(r.email) + '/audio/' + a.slide })));
      }
    }
    detail.replaceChildren(h('div', { class: 'card' },
      h('h3', {}, (r.name || r.email) + ' — ' + r.status + ' (' + r.source + ')'),
      h('p', { class: 'hint' }, 'Fractions are 0 to 1; points are computed from them. Sealed session code: ' + (r.session_code || '—')
        + '. Graded attempts: ' + (r.attempts || 0) + (r.final_at ? '. Marked final: ' + r.final_at : '. Not marked final.')),
      ...(r.final_at ? [h('div', { class: 'row' }, h('button', { class: 'secondary', onclick: async () => {
        if (!confirm('Release this final submission so the student can practise and submit again? Any final grade set from it is cleared.')) return;
        try { await api('/api/t/exams/' + encodeURIComponent(exam.id) + '/results/' + encodeURIComponent(r.email) + '/release', { method: 'POST', body: {} });
          oOut.replaceChildren(msg('ok', 'Released.')); load(); }
        catch (e) { oOut.replaceChildren(msg('err', e.message)); }
      } }, 'Release final submission'))] : []),
      ...audioKids,
      ...(r.motion && r.motion.length ? [h('h4', {}, 'Scene-change captures (' + r.motion.length + ')'),
        h('p', { class: 'hint' }, 'Frames captured when the scene changed suddenly during the take. Times are seconds into the take.'),
        h('div', { class: 'row' }, ...r.motion.map((mf) => h('span', {}, h('img', { src: '/api/t/exams/' + encodeURIComponent(exam.id) + '/results/' + encodeURIComponent(r.email) + '/motion/' + mf.n, style: 'max-width:150px;border-radius:4px', alt: 'Scene change at ' + mf.atSec + ' s' }), h('span', { class: 'hint' }, ' ' + (mf.atSec != null ? mf.atSec + ' s' : '') + (mf.slide ? ', slide ' + mf.slide : '') + ' '))))] : []),
      ...(r.photo ? [h('h4', {}, 'Picture from this take'),
        h('img', { src: '/api/t/exams/' + encodeURIComponent(exam.id) + '/results/' + encodeURIComponent(r.email) + '/photo',
          style: 'max-width:320px;width:100%;border-radius:6px', alt: 'Picture captured during the take' }),
        h('p', { class: 'hint' }, 'Captured ' + (r.photo.atSec != null ? r.photo.atSec + ' s into the take' : 'during the take')
          + (r.photo.slide ? ', slide ' + r.photo.slide : '') + '. Pre-take check: ' + (r.photo.precheck || 'unknown') + '.')] : []),
      h('h4', {}, 'Sealed transcript'), h('pre', { style: 'white-space:pre-wrap' }, r.transcript || '(audio-sealed — the transcript is the student\u2019s Muse one below)'),
      ...(r.student_transcript ? [h('h4', {}, 'Transcript by the student\u2019s Muse (from the sealed audio)'), h('pre', { style: 'white-space:pre-wrap' }, r.student_transcript)] : []),
      h('h4', {}, 'Critique from the student\u2019s Muse'), h('pre', { style: 'white-space:pre-wrap' }, r.critique || '(none uploaded)'),
      h('div', { class: 'tablewrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Element'), h('th', {}, 'Student Muse'), h('th', {}, 'Final fraction'))),
        h('tbody', {}, rows))),
      h('label', { class: 'field' }, 'Comment', comment),
      h('div', { class: 'row' }, h('button', { onclick: async () => {
        const fractions = {};
        detail.querySelectorAll('input[data-name]').forEach((i) => { if (i.value !== '') fractions[i.dataset.name] = Number(i.value); });
        oOut.replaceChildren();
        try { await api('/api/t/exams/' + encodeURIComponent(exam.id) + '/results/' + encodeURIComponent(r.email) + '/override',
            { method: 'POST', body: { fractions, comment: comment.value } });
          oOut.replaceChildren(msg('ok', 'Final grades saved.')); load(); }
        catch (e) { oOut.replaceChildren(msg('err', e.message)); }
      } }, 'Save final grades')),
      oOut));
  };
  const load = async () => {
    const d = await api('/api/t/exams/' + encodeURIComponent(exam.id) + '/results');
    exam = d.exam;
    if (!d.results.length) { listBox.replaceChildren(h('p', { class: 'hint' }, 'No submissions yet.')); detail.replaceChildren(); return; }
    const rows = d.results.map((r) => {
      const tr = h('tr', (r.flags && r.flags.length) ? { style: 'background:var(--warn-bg)' } : {},
        h('td', {}, r.name || r.email), h('td', {}, r.source), h('td', {}, r.status),
        h('td', { class: 'nw' }, fmtTime(r.sealed_at)), h('td', {}, String(r.flags ? r.flags.length : 0)),
        h('td', {}, h('button', { class: 'secondary small', onclick: () => showDetail(r) }, 'View')));
      return tr;
    });
    listBox.replaceChildren(h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Student'), h('th', {}, 'Source'), h('th', {}, 'Status'), h('th', {}, 'Sealed'), h('th', {}, 'Flags'), h('th', {}, ''))),
      h('tbody', {}, rows))));
  };
  node.append(
    h('div', { class: 'card' }, h('h2', {}, 'Results'),
      h('div', { class: 'row' },
        h('button', { class: 'secondary', onclick: load }, 'Refresh results'),
        h('a', { class: 'btn secondary', href: '/api/t/exams/' + encodeURIComponent(exam.id) + '/results.csv' }, 'Download CSV')),
      listBox),
    detail);
  load();
}
