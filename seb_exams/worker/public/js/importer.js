// Read an exam zip in the browser, validate locally, upload.
import { validateExam } from '/shared/validate.js';
import { api, ApiError } from './api.js';
import { b64encode, h, problemList, msg } from './util.js';

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

export async function upload(yamlText, images, replaceId) {
  const imgs = {};
  for (const [n, u8] of Object.entries(images)) imgs[n] = b64encode(u8);
  const body = { yaml: yamlText, images: imgs };
  if (replaceId) body.replace_id = replaceId;
  return api('/api/exams/import', { method: 'POST', body });
}

// Full flow with UI feedback in `target`. Resolves to the import result ({id, warnings}) or null.
export async function importZipFile(file, target, replaceId) {
  target.replaceChildren(msg('', 'Reading ' + file.name + ' …'));
  let z;
  try { z = await readZip(file); } catch (e) {
    target.replaceChildren(problemList(['Could not read the zip file: ' + e.message]));
    return null;
  }
  const local = checkLocally(z.yaml, z.images);
  if (local.errors.length) {
    target.replaceChildren(problemList(local.errors, local.warnings, 'The exam file has these problems. Please fix them and give me the corrected exam.yaml:'),
      h('p', { class: 'hint' }, 'Nothing was uploaded. Fix the file (for example with your AI tool, using "Copy errors") and import it again.'));
    return null;
  }
  target.replaceChildren(msg('', 'Uploading …'));
  try {
    const r = await upload(z.yaml, z.images, replaceId);
    target.replaceChildren(problemList([], r.warnings || local.warnings));
    return r;
  } catch (e) {
    if (e instanceof ApiError && e.data && e.data.errors) {
      target.replaceChildren(problemList(e.data.errors, e.data.warnings, 'The server rejected the exam file for these reasons. Please fix them and give me the corrected exam.yaml:'));
    } else target.replaceChildren(problemList([e.message]));
    return null;
  }
}
