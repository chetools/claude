// Read an exam zip in the browser, validate locally, dry-run on the server, show a preview, import only on approval.
import { validateExam } from '/shared/validate.js';
import { api, ApiError, bumpImages } from './api.js';
import { b64encode, h, problemList, msg } from './util.js';
import { state, reroute } from './app.js';
import { setBarBase } from './bar.js';

const IMG_RE = /\.(svg|png|jpe?g|webp)$/i;

export async function readZip(file) {
  const files = window.fflate.unzipSync(new Uint8Array(await file.arrayBuffer()));
  const paths = Object.keys(files).filter((p) => !p.endsWith('/') && !p.startsWith('__MACOSX/') && !p.split('/').pop().startsWith('.'));
  let yamlPath = paths.find((p) => p === 'exam.yaml');
  if (!yamlPath) {
    const tops = new Set(paths.map((p) => p.split('/')[0]));
    const c = paths.filter((p) => /^[^/]+\/exam\.yaml$/.test(p));
    if (c.length === 1 && tops.size === 1) yamlPath = c[0];
  }
  if (!yamlPath) throw new Error('The zip has no exam.yaml at its root (or in a single top-level folder).');
  const base = yamlPath.slice(0, yamlPath.length - 'exam.yaml'.length);
  const images = {};
  for (const p of paths) {
    if (!p.startsWith(base) || p === yamlPath) continue;
    const name = p.split('/').pop();
    if (IMG_RE.test(name)) images[name] = files[p];
  }
  return { yaml: window.fflate.strFromU8(files[yamlPath]), images };
}

export function checkLocally(yamlText, images) {
  let obj;
  try { obj = window.jsyaml.load(yamlText); } catch (e) {
    return { errors: ['exam.yaml is not valid YAML: ' + String(e.message || e).split('\n')[0]], warnings: [] };
  }
  if (!obj || typeof obj !== 'object') return { errors: ['exam.yaml must contain a mapping with format, title, questions.'], warnings: [] };
  const r = validateExam(obj, Object.keys(images));
  return { errors: r.errors || [], warnings: r.warnings || [] };
}

export async function upload(yamlText, images, replaceId, dryRun) {
  const imgs = {};
  for (const [n, u8] of Object.entries(images)) imgs[n] = b64encode(u8);
  const body = { yaml: yamlText, images: imgs };
  if (replaceId) body.replace_id = replaceId;
  if (dryRun) body.dry_run = true;
  return api('/api/exams/import', { method: 'POST', body });
}

// Open the file chooser (one shared hidden input) and call cb(file).
export function pickZip(cb) {
  const inp = document.getElementById('zipinput');
  inp.onchange = () => { const f = inp.files[0]; inp.value = ''; if (f) cb(f); };
  inp.click();
}

const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const dataUrl = (name, u8) => `data:${MIME[name.split('.').pop().toLowerCase()] || 'application/octet-stream'};base64,${b64encode(u8)}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

export function goToQuestions(id) {
  state.preview = false;
  const target = '#/exam/' + encodeURIComponent(id) + '/questions';
  if (location.hash === target) reroute(); else location.hash = target;
}

// "Q3 (rect-line)": number in the given exam content plus the question id.
const qref = (content, qid) => {
  const i = ((content && content.questions) || []).findIndex((q) => q.id === qid);
  return (i >= 0 ? `Q${i + 1} ` : '') + `(${qid})`;
};
function summaryView(sum, oldContent, newContent) {
  const list = (cls, title, ids, content) => ids.length ? h('div', { class: 'chg ' + cls }, h('h4', {}, `${title} (${ids.length})`),
    h('ul', { class: 'plain' }, ids.map((id) => h('li', {}, qref(content, id))))) : null;
  const added = sum.added || [], removed = sum.removed || [], changed = sum.changed || [], keyc = sum.key_changed || [];
  const none = !(added.length || removed.length || changed.length || keyc.length);
  return h('div', { class: 'card' }, h('h3', {}, 'Changes compared with the current exam'),
    none ? h('p', { class: 'hint' }, 'No question was added, removed or changed.') : null,
    list('add', 'Added', added, newContent), list('rem', 'Removed (numbers from the current exam)', removed, oldContent),
    list('chg', 'Changed', changed, newContent), list('key', 'Answer key or points changed', keyc, newContent),
    h('p', {}, sum.regrade_count ? `Re-grades ${plural(sum.regrade_count, 'submission')}.` : 'No stored submissions to re-grade.'),
    sum.manual_grades_dropped ? msg('warn', `${plural(sum.manual_grades_dropped, 'essay grade')} will be dropped (removed questions or questions that are no longer open).`) : null);
}

// ctx: { body (element to fill), replaceId (exam id when replacing), ex (current exam, for the change summary),
//        choose() (open the chooser again), cancel() }
export async function importPreview(file, ctx) {
  const { body, replaceId, ex } = ctx;
  const label = replaceId ? 'Approve and replace' : 'Approve and save';
  const cancelBtn = h('button', { class: 'secondary small', onclick: ctx.cancel }, 'Cancel');
  const chooseBtn = h('button', { class: 'secondary small', onclick: ctx.choose }, 'Choose another zip');
  const banner = (...more) => h('div', { class: 'card pvbanner' }, h('h2', {}, 'Preview – not saved'),
    h('p', { class: 'hint' }, file.name + (replaceId ? ': nothing changes until you approve the replacement.' : ': nothing is saved until you approve.')), ...more);
  state.preview = false;
  setBarBase([cancelBtn]);
  body.replaceChildren(msg('', 'Reading ' + file.name + ' …'));
  const fail = (errors, warnings, intro) => {
    body.replaceChildren(banner(), problemList(errors, warnings, intro),
      h('p', { class: 'hint' }, 'Nothing was uploaded. Fix the file (for example with your AI tool, using "Copy errors") and choose it again.'));
    setBarBase([h('button', { class: 'small', disabled: true }, label), cancelBtn, chooseBtn]);
  };
  let z;
  try { z = await readZip(file); } catch (e) { return fail(['Could not read the zip file: ' + e.message]); }
  const local = checkLocally(z.yaml, z.images);
  if (local.errors.length) return fail(local.errors, local.warnings, 'The exam file has these problems. Please fix them and give me the corrected exam.yaml:');
  body.replaceChildren(msg('', 'Checking with the server …'));
  let r;
  try { r = await upload(z.yaml, z.images, replaceId, true); } catch (e) {
    if (e instanceof ApiError && e.status === 423) {
      body.replaceChildren(banner(), msg('err', e.message));
      setBarBase([cancelBtn, chooseBtn]);
      return;
    }
    if (e instanceof ApiError && e.data && e.data.errors) return fail(e.data.errors, e.data.warnings, 'The server rejected the exam file for these reasons. Please fix them and give me the corrected exam.yaml:');
    return fail([e.message]);
  }
  const imageUrls = {};
  for (const [n, u8] of Object.entries(z.images)) imageUrls[n] = dataUrl(n, u8);
  const content = r.exam || {};
  const pv = { id: replaceId || null, content, images: Object.keys(z.images).map((name) => ({ name })), imageUrls };
  const { questionsView } = await import('./exam.js');
  const status = h('div', {});
  const approve = h('button', { class: 'small' }, label);
  approve.addEventListener('click', async () => {
    [approve, cancelBtn, chooseBtn].forEach((b) => (b.disabled = true));
    try {
      const res = await upload(z.yaml, z.images);
      bumpImages();
      goToQuestions(replaceId || res.id);
    } catch (e) {
      status.replaceChildren(e instanceof ApiError && e.data && e.data.errors ? problemList(e.data.errors, e.data.warnings) : msg('err', e.message));
      window.scrollTo(0, 0);
      [approve, cancelBtn, chooseBtn].forEach((b) => (b.disabled = false));
      if (e instanceof ApiError && e.status === 423) approve.remove();
    }
  });
  const warnings = r.warnings || local.warnings || [];
  body.replaceChildren(banner(), status, problemList([], warnings), replaceId && r.summary ? summaryView(r.summary, ex && ex.content, content) : null);
  await questionsView(body, pv, { noWarnings: true });
  setBarBase([approve, cancelBtn, chooseBtn]);
  state.preview = true;
}
