import { h, msg, copyText } from './util.js';
import { renderMd } from './render.js';

export async function render(root) {
  const r = await fetch('/docs/AI_EXAM_GUIDE.md', { credentials: 'same-origin' });
  if (!r.ok) { root.append(msg('err', 'The guide could not be loaded (HTTP ' + r.status + ').')); return; }
  const md = await r.text();
  const m = md.match(/<!--\s*PROMPT START\s*-->([\s\S]*?)<!--\s*PROMPT END\s*-->/);
  const prompt = m ? m[1].trim() : md.trim();
  const shown = md.replace(/<!--\s*PROMPT (START|END)\s*-->/g, '');
  const copy = h('button', { onclick: async () => { copy.textContent = (await copyText(prompt)) ? 'Copied ✓' : 'Copy failed'; setTimeout(() => (copy.textContent = 'Copy prompt'), 2000); } }, 'Copy prompt');
  root.append(h('div', { class: 'card' }, h('h2', {}, 'Write an exam with AI'),
    h('p', {}, 'Paste the prompt into your AI tool (Claude, ChatGPT, …), describe your exam, and ask for a zip with exam.yaml and the images. Then import the zip from "My exams". If the import reports errors, use "Copy errors" and paste them back to the AI.'),
    h('div', { class: 'row' }, copy, h('a', { class: 'btn secondary', href: '/docs/example-exam.zip', download: 'example-exam.zip' }, 'Download example exam (zip)')),
    !m ? h('p', { class: 'hint' }, 'The guide has no prompt markers, so the whole guide is copied.') : null),
  h('div', { class: 'card md guide', html: renderMd(shown) }));
}
