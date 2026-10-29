import { api } from './api.js';
import { h, msg, toLocalInput, fromLocalInput, copyText } from './util.js';

export async function render(root, ex) {
  const id = ex.id, base = '/api/exams/' + encodeURIComponent(id);
  const out = h('div', {});
  const flash = (kind, text) => out.replaceChildren(msg(kind, text));
  const reload = () => { location.reload(); };

  const seb = h('input', { type: 'checkbox', checked: ex.require_seb !== false && ex.require_seb !== 0 });
  const opens = h('input', { type: 'datetime-local', value: toLocalInput(ex.opens_at) });
  const closes = h('input', { type: 'datetime-local', value: toLocalInput(ex.closes_at) });
  const keys = h('textarea', { rows: 3, value: (ex.extra_config_keys || []).join('\n'), placeholder: 'one Config Key per line (64 hex characters)' });
  const pw = h('input', { type: 'password', autocomplete: 'new-password', placeholder: ex.has_quit_password ? '(a quit password is set)' : 'new quit password' });

  const body = (extra) => ({ require_seb: seb.checked, opens_at: fromLocalInput(opens.value), closes_at: fromLocalInput(closes.value),
    extra_config_keys: keys.value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean), ...extra });
  const saveSettings = async (extra, okText) => {
    try { await api(base + '/settings', { method: 'PUT', body: body(extra) }); flash('ok', okText || 'Settings saved.'); setTimeout(reload, 600); } catch (e) { flash('err', e.message); }
  };
  const post = async (path, okText) => { try { await api(base + path, { method: 'POST' }); flash('ok', okText); setTimeout(reload, 600); } catch (e) { flash('err', e.message); } };

  const copyBtn = (text) => { const b = h('button', { class: 'secondary small', onclick: async () => { b.textContent = (await copyText(text)) ? 'Copied' : 'Copy failed'; setTimeout(() => (b.textContent = 'Copy'), 1500); } }, 'Copy'); return b; };
  const linkRow = (label, node, copy) => h('div', { class: 'linkrow' }, h('div', { class: 'k' }, label), h('div', { class: 'v' }, node), copy ? copyBtn(copy) : null);

  root.append(out,
    h('div', { class: 'card' }, h('h3', {}, 'Availability'),
      h('p', { class: 'hint' }, 'Times are in your browser\'s local time (' + Intl.DateTimeFormat().resolvedOptions().timeZone + '). Students can start only while the exam is open.'),
      h('div', { class: 'row grid2' }, h('label', { class: 'field grow' }, 'Opens', opens), h('label', { class: 'field grow' }, 'Closes', closes)),
      h('div', { class: 'row' }, h('button', { onclick: () => saveSettings({}, 'Times saved.') }, 'Save settings'),
        h('button', { class: 'secondary', onclick: () => post('/open-now', 'Exam opened.') }, 'Open now'),
        h('button', { class: 'secondary', onclick: () => post('/close-now', 'Exam closed.') }, 'Close now'),
        h('button', { class: 'secondary', onclick: () => { opens.value = ''; closes.value = ''; } }, 'Clear times')),
      h('p', { class: 'hint' }, '"Open now" opens the exam until its duration plus 15 minutes have passed (or the current closing time if later).')),
    h('div', { class: 'card' }, h('h3', {}, 'Safe Exam Browser'),
      h('label', { class: 'check' }, seb, ' Require Safe Exam Browser'),
      h('label', { class: 'field' }, 'Extra accepted Config Keys (for other SEB configurations)', keys),
      h('div', { class: 'row' }, h('button', { onclick: () => saveSettings({}) }, 'Save settings')),
      h('hr'),
      h('label', { class: 'field' }, 'Quit password (students need it to leave SEB early)', pw),
      h('div', { class: 'row' }, h('button', { class: 'secondary', onclick: () => pw.value ? saveSettings({ quit_password: pw.value }, 'Quit password set.') : flash('err', 'Type a password first.') }, 'Set quit password'),
        h('button', { class: 'secondary', disabled: !ex.has_quit_password, onclick: () => saveSettings({ quit_password: null }, 'Quit password cleared.') }, 'Clear quit password')),
      h('p', { class: 'hint' }, ex.has_quit_password ? 'A quit password is currently set.' : 'No quit password is set.')),
    h('div', { class: 'card' }, h('h3', {}, 'Links for students'),
      linkRow('Student page', h('a', { href: ex.student_url, target: '_blank', rel: 'noopener' }, ex.student_url), ex.student_url),
      linkRow('Open in SEB', h('a', { href: ex.seb_link }, ex.seb_link), ex.seb_link),
      linkRow('SEB config file', h('a', { href: `/s/seb/${encodeURIComponent(id)}.seb`, download: id + '.seb' }, id + '.seb (download)')),
      linkRow('Config Key', h('code', {}, ex.config_key || ''), ex.config_key)),
    coTeachers(ex, base, flash, reload),
    h('div', { class: 'card danger-zone' }, h('h3', {}, 'Delete exam'),
      h('p', { class: 'hint' }, 'Deletes the exam, its images and all submissions. This cannot be undone.'),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm('Delete this exam and all its submissions permanently?')) return;
        try { await api(base, { method: 'DELETE' }); location.hash = '#/'; } catch (e) { flash('err', e.message); }
      } }, 'Delete exam')));
}

function coTeachers(ex, base, flash, reload) {
  const email = h('input', { type: 'email', placeholder: 'colleague@school.org' });
  return h('div', { class: 'card' }, h('h3', {}, 'Teachers with access'),
    h('ul', { class: 'plain' }, h('li', {}, ex.owner_email, ' ', h('span', { class: 'hint' }, '(owner)')),
      (ex.teachers || []).map((t) => { const em = typeof t === 'string' ? t : t.email;
        return h('li', {}, em, ' ', h('button', { class: 'secondary small', onclick: async () => {
          if (!confirm('Remove ' + em + ' from this exam?')) return;
          try { await api(`${base}/teachers/${encodeURIComponent(em)}`, { method: 'DELETE' }); reload(); } catch (e) { flash('err', e.message); }
        } }, 'Remove')); })),
    h('div', { class: 'row' }, email, h('button', { class: 'secondary', onclick: async () => {
      try { await api(base + '/teachers', { method: 'POST', body: { email: email.value.trim() } }); reload(); } catch (e) { flash('err', e.message); }
    } }, 'Add teacher')),
    h('p', { class: 'hint' }, 'The person must already be a teacher in this system.'));
}
