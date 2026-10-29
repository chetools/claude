// Small DOM helpers. User content is only ever inserted as text, except `html` (markdown-it/KaTeX output).
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  const add = (k) => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) return k.forEach(add);
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && k !== 'list' && k !== 'form') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  return e;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clone = (o) => JSON.parse(JSON.stringify(o));

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back */ }
  const t = h('textarea', { value: text, style: 'position:fixed;left:-9999px' });
  document.body.append(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  t.remove();
  return ok;
}

export function msg(kind, ...kids) { return h('div', { class: 'msg ' + kind }, ...kids); }

// Errors (and warnings) with a "Copy errors" button, to paste back into an AI tool.
export function problemList(errors, warnings, intro) {
  const box = h('div', {});
  if (errors && errors.length) {
    const btn = h('button', { class: 'secondary small', type: 'button' }, 'Copy errors');
    btn.addEventListener('click', async () => {
      const ok = await copyText((intro ? intro + '\n' : '') + errors.map((e) => '- ' + e).join('\n'));
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => (btn.textContent = 'Copy errors'), 2000);
    });
    box.append(msg('err', h('div', { class: 'row between' }, h('strong', {}, errors.length + (errors.length === 1 ? ' error' : ' errors')), btn),
      h('ul', { class: 'problems' }, errors.map((e) => h('li', {}, e)))));
  }
  if (warnings && warnings.length) {
    box.append(msg('warn', h('strong', {}, warnings.length + (warnings.length === 1 ? ' warning' : ' warnings')),
      h('ul', { class: 'problems' }, warnings.map((e) => h('li', {}, e)))));
  }
  return box;
}

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }

export function b64encode(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64decode(b64) {
  const s = atob(b64), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
export function download(name, blobOrParts, type) {
  const blob = blobOrParts instanceof Blob ? blobOrParts : new Blob(blobOrParts, { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export const slug = (s) => String(s || 'exam').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'exam';
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
