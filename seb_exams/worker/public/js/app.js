import { api, ApiError } from './api.js';
import { h, msg } from './util.js';
import { hideBar, setBarActions } from './bar.js';

const app = document.getElementById('app');
const head = document.getElementById('head');
export const state = { me: null, dirty: false, preview: false };
let lastHash = '', token = 0, revert = false;

function renderHead() {
  const nav = h('nav', { class: 'nav' });
  if (state.me) {
    nav.append(h('a', { href: '#/' }, 'My exams'), h('a', { href: '#/ai' }, 'Write an exam with AI'));
    if (state.me.is_admin) nav.append(h('a', { href: '#/admin' }, 'Teachers'));
    nav.append(h('span', { class: 'who' }, state.me.email),
      h('button', { class: 'secondary small', onclick: signOut }, 'Sign out'));
  }
  head.replaceChildren(h('div', { class: 'headrow' }, h('h1', {}, h('a', { href: '#/', class: 'brand' }, 'SEB Exams')), nav),
    h('div', { class: 'sub' }, 'Teacher area – exams, answers and results are visible only to signed-in teachers of each exam.'));
}
async function signOut() {
  try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'seb-exams' } }); } catch (e) { /* ignore */ }
  state.me = null; state.dirty = false; location.hash = '#/login';
}

async function loginView() {
  state.me = null; renderHead(); setWidth(''); hideBar();
  const out = h('div', {});
  const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'you@school.org', id: 'login-email' });
  const form = h('form', { class: 'card', onsubmit: async (ev) => {
    ev.preventDefault(); out.replaceChildren();
    try {
      await fetch('/auth/request', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'seb-exams' }, body: JSON.stringify({ email: email.value.trim() }) });
      out.replaceChildren(msg('ok', 'If this address belongs to a teacher, a sign-in link is on its way. It is valid for 15 minutes.'));
    } catch (e) { out.replaceChildren(msg('err', 'Could not reach the server: ' + e.message)); }
  } }, h('h2', {}, 'Sign in'),
  h('label', { class: 'field' }, 'Email address', email),
  h('div', { class: 'row' }, h('button', { type: 'submit' }, 'Email me a sign-in link')), h('div', { style: 'margin-top:12px' }, out));
  app.replaceChildren(form);
}

export function setWidth(kind) { document.body.classList.remove('wide', 'mid'); if (kind) document.body.classList.add(kind); }

export function reroute() { return route(); }

async function route() {
  const my = ++token;
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'login') return loginView();
  try {
    if (!state.me) { state.me = await api('/api/me'); }
    if (my !== token) return;
    renderHead();
    if (parts[0] === 'admin' || parts[0] === 'ai') hideBar(); else setBarActions(null);
    app.replaceChildren(h('p', { class: 'hint' }, 'Loading …'));
    let mod, args = [];
    if (parts[0] === 'exam' && parts[1]) { mod = await import('./exam.js'); args = [parts[1], parts[2] || 'questions']; }
    else if (parts[0] === 'admin') mod = await import('./admin.js');
    else if (parts[0] === 'ai') mod = await import('./ai.js');
    else mod = await import('./dashboard.js');
    if (my !== token) return;
    setWidth('');
    const node = h('div', {});
    await mod.render(node, ...args);
    if (my !== token) return;
    app.replaceChildren(node);
  } catch (e) {
    if (my !== token) return;
    if (e instanceof ApiError && e.status === 401) return;
    hideBar();
    app.replaceChildren(msg('err', e.message || String(e)), h('p', {}, h('a', { href: '#/' }, 'Back to my exams')));
  }
}

window.addEventListener('hashchange', () => {
  if (revert) { revert = false; return; }
  const warn = state.preview ? 'This import preview has not been approved, so nothing is saved. Leave the preview?'
    : state.dirty ? 'You have unsaved changes in the editor. Leave without saving?' : '';
  if (warn && !confirm(warn)) { revert = true; location.hash = lastHash; return; }
  state.dirty = false; state.preview = false; lastHash = location.hash; route();
});
window.addEventListener('beforeunload', (e) => { if (state.dirty || state.preview) { e.preventDefault(); e.returnValue = ''; } });
lastHash = location.hash;
route();
