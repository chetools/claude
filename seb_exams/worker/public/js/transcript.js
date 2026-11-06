// Transcript exams inside the teacher app: list + model connection, and the
// per-exam tabs (Exam, Roster, Results). Talks to /api/t/* (see api.js).
import { api } from './api.js';
import { h, msg, fmtTime, toLocalInput } from './util.js';
import { showBar } from './bar.js';

const DEFAULT_RUBRIC = [
  { name: "Technical accuracy", points: 10, guidance: "Terms, signs and subscripts correct; claims match the equations shown." },
  { name: "Technical completeness", points: 10, guidance: "Every equation explained in full, nothing skipped." },
  { name: "Introduction", points: 5, guidance: "What was said does the work an introduction should: it sets up the topic and what follows." },
  { name: "Relevance", points: 5, guidance: "Why the result matters is established, not merely asserted." },
  { name: "Summary", points: 5, guidance: "The summary covers what was derived." },
  { name: "Conclusion", points: 5, guidance: "A conclusion is drawn from the derivation." },
];
const DEFAULT_VARIATIONS = [
  "(a) Explain 9 to a first-year student in 30 s, with no symbols.",
  "(b) State what changes if friction is not zero.",
  "(c) State what changes if point 2 is higher and slower.",
  "(d) A pump is added between the points — which term returns?",
];
const pts = (frac, points) => (typeof frac === "number" ? String(Math.round(frac * points * 100) / 100) : "—");
const badge = (status) => h('span', { class: 'badge ' + status }, status);

export async function render(node, id, tab) {
  if (!id) return listView(node);
  return examView(node, id, tab || 'exam');
}

// ---- list + model connection ------------------------------------------------
async function listView(node) {
  showBar({ title: 'Transcript exams' });
  const out = h('div', {});
  const prov = h('input', { type: 'text' });
  const base = h('input', { type: 'text', placeholder: 'https://api.example.com/v1' });
  const mod = h('input', { type: 'text' });
  const mOut = h('div', {});
  const cfg = await api('/api/t/settings/model');
  prov.value = cfg.provider || ''; base.value = cfg.base_url || ''; mod.value = cfg.model || '';
  const modelCard = h('div', { class: 'card' },
    h('h2', {}, 'Model connection (audit re-grade)'),
    h('p', { class: 'hint' }, 'The audit re-grades each submission, grades only, with the exam\u2019s prompt and rubric, through this connection (an OpenAI-style chat completions service). The key itself is a server secret and is never stored here. ' + (cfg.audio_configured ? 'Audio storage (R2) is connected.' : 'Audio storage (R2) is not connected yet; audio takes cannot be accepted until it is.')),
    h('label', { class: 'field' }, 'Provider name', prov),
    h('label', { class: 'field' }, 'Service address (base URL)', base),
    h('label', { class: 'field' }, 'Model', mod),
    h('div', { class: 'row' }, h('button', { onclick: async () => {
      mOut.replaceChildren();
      try { await api('/api/t/settings/model', { method: 'PUT', body: { provider: prov.value, base_url: base.value, model: mod.value } });
        mOut.replaceChildren(msg('ok', 'Connection saved.')); }
      catch (e) { mOut.replaceChildren(msg('err', e.message)); }
    } }, 'Save connection'), h('span', { class: 'hint' }, cfg.key_configured ? 'A model key is configured on the server.' : 'No model key is configured on the server; the audit will be skipped.')),
    mOut);

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
        title: 'New transcript exam', app_url: 'https://chetools.github.io/muse/bernoulli-explain/',
        assignment: 'bernoulli-equation', prompt: '', rubric: DEFAULT_RUBRIC, variations: DEFAULT_VARIATIONS,
        opens_at: null, closes_at: null } });
      location.hash = '#/texam/' + encodeURIComponent(d.id) + '/exam';
    } catch (e) { out.replaceChildren(msg('err', e.message)); newBtn.disabled = false; }
  } }, 'New transcript exam');
  node.append(modelCard,
    h('div', { class: 'card' }, h('h2', {}, 'Your transcript exams'), listBox, h('div', { class: 'row' }, newBtn)),
    out);
  draw((await api('/api/t/exams')).exams);
}

// ---- one exam -----------------------------------------------------------------
const TABS = [['exam', 'Exam'], ['roster', 'Roster'], ['results', 'Results']];
async function examView(node, id, tab) {
  const exam = (await api('/api/t/exams/' + encodeURIComponent(id))).exam;
  showBar({ title: exam.title || exam.id, badge: badge(exam.status),
    tabs: TABS.map(([k, label]) => ({ href: '#/texam/' + encodeURIComponent(id) + '/' + k, label, on: k === tab })) });
  node.append(h('p', {}, h('a', { href: '#/texams' }, '← Transcript exams')));
  if (tab === 'roster') return rosterTab(node, exam);
  if (tab === 'results') return resultsTab(node, exam);
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
  (exam.rubric && exam.rubric.length ? exam.rubric : DEFAULT_RUBRIC).forEach(addRow);
  const variations = h('textarea', { rows: 4, value: (exam.variations && exam.variations.length ? exam.variations : DEFAULT_VARIATIONS).join('\n') });
  const body = () => ({ title: title.value, app_url: appUrl.value, assignment: assign.value,
    opens_at: opens.value ? new Date(opens.value).toISOString() : null,
    closes_at: closes.value ? new Date(closes.value).toISOString() : null,
    prompt: prompt.value,
    rubric: [...tbody.querySelectorAll('tr')].map((tr) => tr._read()).filter((r) => r.name),
    variations: variations.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) });
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
    h('label', { class: 'field' }, 'Variations (one per line; the server issues one at the start of each take)', variations),
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
    h('h3', {}, 'Teacher-Muse validation'),
    h('p', { class: 'hint' }, 'Students practise as often as they like; only a take they mark final needs validation. Your Muse validates final submissions with this exam\u2019s audit token: it downloads the sealed audio, transcribes and grades it independently, and its grades become the final grade when they agree with the student\u2019s. Generating a token replaces the previous one. The token is shown once \u2014 store it where your Muse can read it, not in the exam record.'),
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

function resultsTab(node, exam) {
  const listBox = h('div', {});
  const detail = h('div', {});
  const showDetail = (r) => {
    const rows = (exam.rubric || []).map((el) => {
      const s = r.grades ? r.grades[el.name] : undefined;
      const a = r.audit && r.audit.fractions ? r.audit.fractions[el.name] : undefined;
      const f = r.manual && r.manual.fractions && typeof r.manual.fractions[el.name] === 'number' ? r.manual.fractions[el.name] : s;
      const flagged = (r.flags || []).some((fl) => fl.element === el.name);
      const inp = h('input', { type: 'number', class: 'num', min: '0', max: '1', step: '0.05', value: typeof f === 'number' ? String(f) : '' });
      inp.dataset.name = el.name;
      return h('tr', flagged ? { style: 'background:var(--warn-bg)' } : {},
        h('td', {}, el.name + ' (' + el.points + ' points)'), h('td', {}, pts(s, el.points)),
        h('td', {}, pts(a, el.points)), h('td', {}, inp));
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
      h('p', { class: 'hint' }, 'Audit: ' + (r.audit ? r.audit.status : 'not run') + (r.audit && r.audit.model ? ' · ' + r.audit.model : '')
        + '. Fractions are 0 to 1; points are computed from them. Sealed session code: ' + (r.session_code || '—')
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
      h('h4', {}, 'Sealed transcript'), h('pre', { style: 'white-space:pre-wrap' }, r.transcript || '(not sealed)'),
      ...(r.student_transcript ? [h('h4', {}, 'Transcript by the student\u2019s Muse (from the sealed audio)'), h('pre', { style: 'white-space:pre-wrap' }, r.student_transcript)] : []),
      h('h4', {}, 'Critique from the student\u2019s Muse'), h('pre', { style: 'white-space:pre-wrap' }, r.critique || '(none uploaded)'),
      h('div', { class: 'tablewrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Element'), h('th', {}, 'Student Muse'), h('th', {}, 'Audit'), h('th', {}, 'Final fraction'))),
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
  const mEmail = h('input', { type: 'text' });
  const mName = h('input', { type: 'text' });
  const mText = h('textarea', { rows: 6 });
  const mOut = h('div', {});
  node.append(
    h('div', { class: 'card' }, h('h2', {}, 'Results'),
      h('div', { class: 'row' },
        h('button', { class: 'secondary', onclick: load }, 'Refresh results'),
        h('a', { class: 'btn secondary', href: '/api/t/exams/' + encodeURIComponent(exam.id) + '/results.csv' }, 'Download CSV')),
      listBox),
    detail,
    h('div', { class: 'card' }, h('h2', {}, 'Add a transcript by hand (exceptions)'),
      h('p', { class: 'hint' }, 'For a student whose sealed submission failed. Stored marked as teacher-entered and unsealed.'),
      h('label', { class: 'field' }, 'Student email', mEmail),
      h('label', { class: 'field' }, 'Student name', mName),
      h('label', { class: 'field' }, 'Transcript', mText),
      h('div', { class: 'row' }, h('button', { class: 'secondary', onclick: async () => {
        mOut.replaceChildren();
        try { await api('/api/t/exams/' + encodeURIComponent(exam.id) + '/manual', { method: 'POST',
            body: { email: mEmail.value, name: mName.value, transcript: mText.value } });
          mOut.replaceChildren(msg('ok', 'Added.')); load(); }
        catch (e) { mOut.replaceChildren(msg('err', e.message)); }
      } }, 'Add transcript')),
      mOut));
  load();
}
