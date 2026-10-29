import { api } from './api.js';
import { h, msg } from './util.js';

export async function render(root) {
  const out = h('div', {});
  const list = await api('/api/teachers');
  const flash = (k, t) => out.replaceChildren(msg(k, t));
  const rows = list.map((t) => {
    const name = h('input', { value: t.name || '' });
    const adm = h('input', { type: 'checkbox', checked: !!t.is_admin });
    const act = h('input', { type: 'checkbox', checked: t.active !== 0 && t.active !== false });
    return h('tr', {}, h('td', {}, t.email), h('td', {}, name), h('td', {}, h('label', {}, adm, ' admin')), h('td', {}, h('label', {}, act, ' active')),
      h('td', { class: 'nw' }, h('button', { class: 'secondary small', onclick: async () => {
        try { await api('/api/teachers/' + encodeURIComponent(t.email), { method: 'PUT', body: { name: name.value, is_admin: adm.checked, active: act.checked } }); flash('ok', 'Saved ' + t.email); } catch (e) { flash('err', e.message); }
      } }, 'Save'), ' ', h('button', { class: 'danger small', onclick: async () => {
        if (!confirm('Remove ' + t.email + '? Their exams are transferred to you.')) return;
        try { await api('/api/teachers/' + encodeURIComponent(t.email), { method: 'DELETE' }); location.reload(); } catch (e) { flash('err', e.message); }
      } }, 'Remove')));
  });
  const email = h('input', { type: 'email', placeholder: 'email' }), name = h('input', { placeholder: 'name' }), adm = h('input', { type: 'checkbox' });
  root.append(h('div', { class: 'card' }, h('h2', {}, 'Teachers'), out,
    h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Email', 'Name', '', '', ''].map((c) => h('th', {}, c)))), h('tbody', {}, rows)))),
  h('div', { class: 'card' }, h('h3', {}, 'Add a teacher'),
    h('div', { class: 'row' }, email, name, h('label', {}, adm, ' admin'), h('button', { onclick: async () => {
      try { await api('/api/teachers', { method: 'POST', body: { email: email.value.trim(), name: name.value.trim(), is_admin: adm.checked } }); location.reload(); } catch (e) { flash('err', e.message); }
    } }, 'Add'))));
}
