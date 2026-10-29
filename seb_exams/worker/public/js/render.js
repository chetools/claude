// Markdown + KaTeX: protect $$..$$ and $..$ before markdown-it, render with KaTeX, restore.
// Needs the globals `markdownit` and `katex` (loaded from jsDelivr by index.html).
import { esc } from './util.js';
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$(?!\$)([\s\S]+?)(?<!\\)\$/g;
let MD;
export function renderMd(text, { inline = false, blanks = null } = {}) {
  MD = MD || window.markdownit('commonmark', { html: false }).enable('table');
  const math = [];
  let src = String(text ?? '');
  if (blanks) src = src.replace(/\[\[(\d+)\]\]/g, (m, n) => `BLANKX${n}X`);
  src = src.replace(MATH_RE, (m, d, i) => { math.push([(d !== undefined ? d : i).trim(), d !== undefined]); return `MATHX${math.length - 1}X`; });
  let out = inline ? MD.renderInline(src) : MD.render(src);
  const rendered = math.map(([t, disp]) => {
    try { return window.katex.renderToString(t, { displayMode: disp, throwOnError: false }); } catch (e) { return esc(t); }
  });
  const restore = (m, i) => (math[i][1] ? `<div class="eq">${rendered[i]}</div>` : rendered[i]);
  out = out.replace(/<p>\s*MATHX(\d+)X\s*<\/p>/g, restore).replace(/MATHX(\d+)X/g, restore);
  if (blanks) out = out.replace(/BLANKX(\d+)X/g, (m, n) => blanks(Number(n)));
  return out;
}

// Row of boxes for a fill pattern. "_" = box to fill (shows `answer` char when given), " " = gap, "-" = hyphen,
// other characters = shown (fixed) boxes.
export function boxesHtml(pattern, answer) {
  const cells = [...String(pattern || '')].map((c, i) => {
    if (c === '_') return `<span class="bx${answer ? ' ans' : ''}">${answer ? esc(answer[i] ?? '') : ''}</span>`;
    if (c === ' ') return '<span class="bx-gap"></span>';
    if (c === '-') return '<span class="bx-sep">-</span>';
    return `<span class="bx fixed">${esc(c)}</span>`;
  });
  return `<span class="boxes">${cells.join('') || '<span class="bx"></span>'}</span>`;
}
