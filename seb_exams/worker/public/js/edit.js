import { api, ApiError, bumpImages, setImg } from './api.js';
import { h, clone, msg, problemList, debounce, b64encode } from './util.js';
import { renderMd, boxesHtml } from './render.js';
import { fillPattern, validateExam } from '/shared/validate.js';
import { state, reroute } from './app.js';
import { setBarActions } from './bar.js';

const TYPES = [['mc', 'Multiple choice'], ['fill', 'Fill in the blanks'], ['open', 'Open question']];
const IMG_OK = /\.(svg|png|jpe?g|webp)$/i;

export async function render(root, ex) {
  const st = clone(ex.content);
  st.questions = st.questions || [];
  let images = (ex.images || []).slice();
  const examId = ex.id;
  const markDirty = () => { state.dirty = true; flash = ''; saveBtn.textContent = 'Save'; validate(); };

  const safePattern = (b) => { try { return fillPattern({ answer: b.answer || '', ...(b.clue ? { clue: b.clue } : {}), ...(b.variants && b.variants.length ? { variants: b.variants } : {}) }); } catch (e) { return ''; } };
  const nextId = () => { const used = new Set(st.questions.map((q) => q.id)); let i = st.questions.length + 1; while (used.has('q' + i)) i++; return 'q' + i; };

  // The clean JSON form that is validated and saved.
  function clean() {
    const c = { format: st.format || 'seb-exam/1', title: st.title || '', duration_minutes: Number(st.duration_minutes) };
    if (st.intro && st.intro.trim()) c.intro = st.intro;
    c.questions = st.questions.map((q) => {
      const o = { id: q.id, type: q.type, points: Number(q.points), text: q.text || '' };
      if (q.image) { o.image = q.image; o.image_alt = q.image_alt || ''; }
      if (q.type === 'mc') {
        o.shuffle_options = q.shuffle_options !== false;
        o.options = (q.options || []).map((op) => ({ text: op.text || '', correct: !!op.correct }));
      } else if (q.type === 'fill') {
        o.blanks = (q.blanks || []).map((b) => {
          const x = { answer: b.answer || '' };
          if (b.variants && b.variants.length) x.variants = b.variants;
          if (b.clue) x.clue = b.clue;
          return x;
        });
      } else if (q.model_answer && q.model_answer.trim()) o.model_answer = q.model_answer;
      return o;
    });
    return c;
  }

  // ---- top-level fields
  const prevFor = (ta, box, opts) => {
    const upd = () => { box.innerHTML = renderMd(ta.value, typeof opts === 'function' ? opts() : opts || {}); };
    upd(); ta.addEventListener('input', debounce(upd, 150));
    return upd;
  };
  const textArea = (value, onInput, rows = 4) => h('textarea', { rows, value: value || '', oninput: (e) => { onInput(e.target.value); markDirty(); } });
  const split = (label, ta, box, extra) => h('div', { class: 'field' }, h('label', {}, label), h('div', { class: 'split' }, ta, h('div', { class: 'preview' }, box)), extra);

  const titleIn = h('input', { value: st.title || '', oninput: (e) => { st.title = e.target.value; markDirty(); } });
  const durIn = h('input', { type: 'number', min: 1, max: 600, value: st.duration_minutes, oninput: (e) => { st.duration_minutes = e.target.value; markDirty(); } });
  const introTa = textArea(st.intro, (v) => (st.intro = v), 4), introBox = h('div', { class: 'md' });
  prevFor(introTa, introBox);

  const qBox = h('div', { class: 'qlist' });
  const status = h('div', {});
  const saveBtn = h('button', { class: 'small', onclick: save }, 'Save');
  const discardBtn = h('button', { class: 'secondary small', onclick: discard }, 'Discard');
  let flash = '';
  // Save / Discard live in the fixed bar and show only while there are unsaved changes.
  function updateBar() {
    const n = lastResult.errors.length;
    if (state.dirty) setBarActions([n ? h('button', { class: 'danger small', onclick: () => status.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, plural(n)) : null, saveBtn, discardBtn]);
    else setBarActions(flash ? h('span', { class: 'hint nw' }, flash) : null);
  }
  const plural = (n) => n + (n === 1 ? ' error' : ' errors');
  function discard() {
    if (!confirm('Discard all unsaved changes and reload the saved content?')) return;
    state.dirty = false; setBarActions(null); reroute();
  }

  function qCard(q, i) {
    const n = i + 1, card = h('section', { class: 'card qedit' });
    const move = (d) => { const j = i + d; if (j < 0 || j >= st.questions.length) return; [st.questions[i], st.questions[j]] = [st.questions[j], st.questions[i]]; markDirty(); drawQ(); };
    const typeSel = h('select', { onchange: (e) => {
      q.type = e.target.value;
      if (q.type === 'mc' && !q.options) q.options = [{ text: '', correct: true }, { text: '', correct: false }];
      if (q.type === 'fill' && !q.blanks) q.blanks = [{ answer: '' }];
      markDirty(); drawQ();
    } }, TYPES.map(([k, l]) => h('option', { value: k, selected: q.type === k }, l)));
    const pts = h('input', { type: 'number', min: 0, step: 'any', value: q.points, class: 'num', oninput: (e) => { q.points = e.target.value; markDirty(); } });
    card.append(h('div', { class: 'qhead' }, h('strong', {}, 'Question ' + n), typeSel, h('label', { class: 'inl' }, 'Points ', pts), h('span', { class: 'grow' }),
      h('button', { class: 'secondary small', title: 'Move up', disabled: i === 0, onclick: () => move(-1) }, '↑'),
      h('button', { class: 'secondary small', title: 'Move down', disabled: i === st.questions.length - 1, onclick: () => move(1) }, '↓'),
      h('button', { class: 'danger small', onclick: () => { if (confirm('Delete question ' + n + '?')) { st.questions.splice(i, 1); markDirty(); drawQ(); } } }, 'Delete')));

    // text + preview (fill questions show boxes in the preview)
    const box = h('div', { class: 'md' });
    const ta = textArea(q.text, (v) => (q.text = v), 5);
    const blankPrev = (k) => { const b = (q.blanks || [])[k - 1]; return b ? boxesHtml(safePattern(b)) : '<span class="bx err">?</span>'; };
    const refreshText = prevFor(ta, box, () => (q.type === 'fill' ? { blanks: blankPrev } : {}));
    card.append(split(q.type === 'fill' ? 'Text (write [[1]], [[2]], … where the boxes go)' : 'Question text (Markdown, $math$ and $$display math$$)', ta, box));

    // image
    const imgRow = h('div', { class: 'imgrow' });
    const drawImg = () => {
      const sel = h('select', { onchange: (e) => { q.image = e.target.value || undefined; markDirty(); drawImg(); } },
        h('option', { value: '' }, '(no image)'), images.map((im) => h('option', { value: im.name, selected: q.image === im.name }, im.name)),
        q.image && !images.some((im) => im.name === q.image) ? h('option', { value: q.image, selected: true }, q.image + ' (missing)') : null);
      const up = h('input', { type: 'file', accept: '.svg,.png,.jpg,.jpeg,.webp,image/*', class: 'hidden', onchange: async () => {
        const f = up.files[0]; up.value = '';
        if (!f) return;
        const name = f.name.replace(/[^A-Za-z0-9._-]+/g, '-');
        if (!IMG_OK.test(name)) return alert('Images must be svg, png, jpg, jpeg or webp.');
        if (f.size > 1024 * 1024) return alert('Images must be at most 1 MB.');
        try {
          await api(`/api/exams/${encodeURIComponent(examId)}/images`, { method: 'POST', body: { name, base64: b64encode(new Uint8Array(await f.arrayBuffer())) } });
          bumpImages();
          images = images.filter((im) => im.name !== name); images.push({ name, mime: f.type, size: f.size });
          q.image = name; markDirty(); drawQ();
        } catch (e) { alert('Upload failed: ' + e.message); }
      } });
      const alt = h('input', { value: q.image_alt || '', placeholder: 'Describe the image (required)', oninput: (e) => { q.image_alt = e.target.value; markDirty(); } });
      imgRow.replaceChildren(h('div', { class: 'row' }, h('label', { class: 'inl' }, 'Image ', sel), h('button', { class: 'secondary small', onclick: () => up.click() }, 'Upload image …'), up),
        ...[q.image ? h('div', { class: 'row top' }, setImg(h('img', { class: 'thumb', alt: '' }), examId, q.image), h('label', { class: 'grow' }, 'Image description (alt text)', alt)) : null].filter(Boolean));
    };
    drawImg(); card.append(imgRow);

    if (q.type === 'mc') {
      q.options = q.options || [];
      const list = h('div', { class: 'optlist' });
      const drawOpts = () => {
        list.replaceChildren(...q.options.map((o, k) => {
          const pv = h('div', { class: 'md' });
          const t = textArea(o.text, (v) => (o.text = v), 2); prevFor(t, pv);
          return h('div', { class: 'optedit' }, h('label', { class: 'corr' }, h('input', { type: 'radio', name: 'c' + i + '-' + st.questions.length, checked: !!o.correct,
            onchange: () => { q.options.forEach((x) => (x.correct = false)); o.correct = true; markDirty(); } }), 'correct'),
          h('div', { class: 'split' }, t, h('div', { class: 'preview' }, pv)),
          h('button', { class: 'secondary small', title: 'Remove option', disabled: q.options.length <= 2, onclick: () => { q.options.splice(k, 1); markDirty(); drawOpts(); } }, '✕'));
        }));
      };
      drawOpts();
      card.append(h('div', { class: 'field' }, h('label', {}, 'Options (exactly one correct)'), list,
        h('div', { class: 'row' }, h('button', { class: 'secondary small', onclick: () => { if (q.options.length < 8) { q.options.push({ text: '', correct: false }); markDirty(); drawOpts(); } } }, '+ Add option'),
          h('label', { class: 'inl' }, h('input', { type: 'checkbox', checked: q.shuffle_options !== false, onchange: (e) => { q.shuffle_options = e.target.checked; markDirty(); } }), ' shuffle options for each student'))));
    } else if (q.type === 'fill') {
      q.blanks = q.blanks || [];
      const list = h('div', { class: 'blanklist' });
      const drawBlanks = () => {
        list.replaceChildren(...q.blanks.map((b, k) => {
          const prev = h('span', { class: 'bprev', html: boxesHtml(safePattern(b), b.answer && !b.clue ? b.answer : undefined) });
          const upd = () => { prev.innerHTML = boxesHtml(safePattern(b)); refreshText(); };
          return h('div', { class: 'blankedit' }, h('strong', {}, '[[' + (k + 1) + ']]'),
            h('label', {}, 'Answer', h('input', { value: b.answer || '', oninput: (e) => { b.answer = e.target.value; upd(); markDirty(); } })),
            h('label', {}, 'Also accepted (comma separated)', h('input', { value: (b.variants || []).join(', '), oninput: (e) => { b.variants = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); markDirty(); } })),
            h('label', {}, 'Clue (optional, _ = box)', h('input', { value: b.clue || '', placeholder: '_a__________', oninput: (e) => { b.clue = e.target.value; upd(); markDirty(); } })),
            h('div', { class: 'bpv' }, h('span', { class: 'hint' }, 'Boxes: '), prev),
            h('button', { class: 'secondary small', title: 'Remove blank', onclick: () => { q.blanks.splice(k, 1); markDirty(); drawBlanks(); refreshText(); } }, '✕'));
        }));
      };
      drawBlanks();
      card.append(h('div', { class: 'field' }, h('label', {}, 'Blanks (in the order of the [[n]] markers)'), list,
        h('button', { class: 'secondary small', onclick: () => { q.blanks.push({ answer: '' }); q.text = (q.text || '').replace(/\s*$/, '') + ' [[' + q.blanks.length + ']]'; ta.value = q.text; markDirty(); drawBlanks(); refreshText(); } }, '+ Add blank (appends a [[n]] marker)')));
    } else {
      const pv = h('div', { class: 'md' });
      const t = textArea(q.model_answer, (v) => (q.model_answer = v), 4); prevFor(t, pv);
      card.append(split('Model answer (teacher only, optional)', t, pv));
    }
    return card;
  }
  function drawQ() { qBox.replaceChildren(...st.questions.map(qCard)); }
  const addQ = (type) => {
    const q = { id: nextId(), type, points: 1, text: '' };
    if (type === 'mc') q.options = [{ text: '', correct: true }, { text: '', correct: false }];
    if (type === 'fill') { q.blanks = [{ answer: '' }]; q.text = '[[1]]'; }
    st.questions.push(q); markDirty(); drawQ();
    qBox.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  let lastResult = { errors: [], warnings: [] };
  function validate() {
    let r;
    try { r = validateExam(clone(clean()), images.map((i) => i.name)); } catch (e) { r = { errors: ['Internal validation error: ' + e.message], warnings: [] }; }
    lastResult = r;
    status.replaceChildren(problemList(r.errors, r.warnings));
    saveBtn.disabled = r.errors.length > 0;
    updateBar();
  }
  async function save() {
    saveBtn.disabled = true; saveBtn.textContent = 'Saving …';
    try {
      const r = await api(`/api/exams/${encodeURIComponent(examId)}/content`, { method: 'PUT', body: { content: clean() } });
      state.dirty = false; flash = 'Saved ✓';
      if (r.warnings && r.warnings.length) status.replaceChildren(problemList([], r.warnings));
    } catch (e) {
      if (e instanceof ApiError && e.data.errors) status.replaceChildren(problemList(e.data.errors, e.data.warnings));
      else status.replaceChildren(msg('err', e.message));
    }
    saveBtn.textContent = 'Save';
    saveBtn.disabled = lastResult.errors.length > 0;
    updateBar();
  }

  root.append(
    h('div', { class: 'card' }, h('div', { class: 'row grid2' },
      h('label', { class: 'field grow' }, 'Title', titleIn), h('label', { class: 'field' }, 'Duration (minutes, 1–600)', durIn)),
    split('Introduction (optional, shown above the questions)', introTa, introBox)),
    qBox,
    h('div', { class: 'card row' }, h('strong', {}, 'Add question:'), TYPES.map(([k, l]) => h('button', { class: 'secondary', onclick: () => addQ(k) }, '+ ' + l))),
    status,
    h('p', { class: 'hint' }, 'Saving regrades all existing submissions. Save and Discard are in the bar at the top.'));
  drawQ();
  state.dirty = false;
  validate();
}
