// The fixed (sticky) bar at the top of the dashboard and of every exam page.
// showBar() builds it; setBarActions(nodes|null) lets a tab add its own buttons; setBarBase(nodes|null) swaps the page's own actions.
import { h } from './util.js';

const bar = document.getElementById('bar'), inner = document.getElementById('barin');
let defaults = [], base = [], extra = [], slot = null;
const flat = (n) => (n == null ? [] : [].concat(n)).filter(Boolean);

// Publish the bar height as --barh so other sticky elements can sit below it.
function sync() { document.documentElement.style.setProperty('--barh', (bar.classList.contains('hidden') ? 0 : Math.ceil(bar.getBoundingClientRect().height)) + 'px'); }
if (window.ResizeObserver) new ResizeObserver(sync).observe(bar);

function draw() { if (slot) slot.replaceChildren(...extra, ...base); sync(); }

// Label with a short form for phones: lab('Export', ' zip') shows "Export" on phones and "Export zip" elsewhere.
export const lab = (short, long) => [short, h('span', { class: 'long' }, long)];

// opts: { title, badge (node), back (true: "← All exams" link), tabs: [{href, label, on}], actions: [nodes] }
export function showBar({ title, badge, back, tabs, actions }) {
  defaults = flat(actions); base = defaults; extra = [];
  slot = h('div', { class: 'baractions' });
  const row = h('div', { class: 'barrow' },
    back ? h('a', { class: 'back', href: '#/', title: 'All exams' }, '←', h('span', { class: 'long' }, ' All exams')) : null,
    h('h2', { class: 'bartitle', title }, title), badge, h('span', { class: 'grow' }), slot);
  const nav = tabs ? h('nav', { class: 'tabs' }, tabs.map((t) => h('a', { href: t.href, class: t.on ? 'on' : '' }, t.label))) : null;
  inner.replaceChildren(row, nav);
  bar.classList.toggle('notabs', !nav);
  bar.classList.remove('hidden');
  draw();
  const on = nav && nav.querySelector('.on');
  if (on) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
}
export function hideBar() { bar.classList.add('hidden'); inner.replaceChildren(); slot = null; sync(); }
// Buttons a tab puts in front of the page's own actions; null removes them.
export function setBarActions(nodes) { extra = flat(nodes); draw(); }
// Replace the page's own actions (preview mode); null restores them.
export function setBarBase(nodes) { base = nodes == null ? defaults : flat(nodes); draw(); }
