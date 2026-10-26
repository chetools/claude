// node tests/convert.test.mjs  — unit tests of web/convert.js
import { createRequire } from "module";
import assert from "assert/strict";
const require = createRequire(import.meta.url);
const markdownit = require("../.buildtools/node_modules/markdown-it");
import fs from "fs";
const { convertAll, cleanModelOutput, pickFreeVisionModels, cer, scoreTranscription } = require("../web/convert.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const C = (md) => convertAll(markdownit, md);

t("unwraps ```markdown fence", () => {
  assert.equal(cleanModelOutput("```markdown\n# Hi\n```"), "# Hi");
  assert.equal(cleanModelOutput("# Hi\n\n```py\nx\n```"), "# Hi\n\n```py\nx\n```");
});

t("headings", () => {
  const r = C("# One\n\n### Three\n\n#### Four");
  assert.equal(r.discord, "# One\n\n### Three\n\n**Four**");
  assert.equal(r.plain, "One\n\nThree\n\nFour");
  assert.match(r.html, /<h1 style="font-size:1.6em[^"]*">One<\/h1>/);
});

t("emphasis", () => {
  const r = C("A **bold** and *it* and ~~gone~~ and `x_y`.");
  assert.equal(r.discord, "A **bold** and *it* and ~~gone~~ and `x_y`.");
  assert.equal(r.plain, "A bold and it and gone and x_y.");
  assert.match(r.html, /<strong>bold<\/strong>/);
  assert.match(r.html, /<em>it<\/em>/);
  assert.match(r.html, /<s>gone<\/s>/);
  assert.match(r.html, /<code style="font-family/);
});

t("discord escapes literal markdown characters", () => {
  const r = C("snake\\_case and 2\\*3 and a\\|b");
  assert.equal(r.discord, "snake\\_case and 2\\*3 and a\\|b");
  assert.equal(r.plain, "snake_case and 2*3 and a|b");
});

t("nested tight lists", () => {
  const r = C("- a\n  - b\n    - c\n- d\n\n3. x\n4. y");
  assert.equal(r.discord, "- a\n  - b\n    - c\n- d\n\n3. x\n4. y");
  assert.equal(r.plain, "• a\n  ◦ b\n    ▪ c\n• d\n\n3. x\n4. y");
  assert.match(r.html, /<ol start="3" style=/);
});

t("loose list with two paragraphs", () => {
  const r = C("1. first\n\n   more\n\n2. second");
  assert.equal(r.plain, "1. first\n\n   more\n\n2. second");
});

t("table", () => {
  const r = C("| Name | Qty |\n|---|---|\n| **Apple** | 3 |\n| Kiwi | 12 |");
  assert.equal(r.discord, "```\nName  | Qty\n------+----\nApple | 3\nKiwi  | 12\n```");
  assert.equal(r.plain, "Name | Qty\nApple | 3\nKiwi | 12");
  assert.match(r.html, /<table style="border-collapse/);
  assert.match(r.html, /<td style="border:1px solid #bbb[^"]*"><strong>Apple<\/strong><\/td>/);
});

t("code fence and blockquote", () => {
  const r = C("```python\nprint('*x*')\n```\n\n> quoted **line**\n> two");
  assert.equal(r.discord, "```python\nprint('*x*')\n```\n\n> quoted **line**\n> two");
  assert.equal(r.plain, "print('*x*')\n\n> quoted line\n> two");
  assert.match(r.html, /<pre style="background[^"]*"><code>print\('\*x\*'\)/);
});

t("links", () => {
  const r = C("See [docs](https://a.b/c) or https://x.y");
  assert.equal(r.discord, "See [docs](https://a.b/c) or https://x.y");
  assert.equal(r.plain, "See docs (https://a.b/c) or https://x.y");
});

t("raw html is escaped, javascript: links dropped", () => {
  const r = C("<img src=x onerror=alert(1)> [x](javascript:alert(1))");
  assert.ok(!/<img/.test(r.html));
  assert.ok(!/href="javascript/.test(r.html));
});

t("paragraph that looks like block syntax is escaped for discord", () => {
  const r = C("1\\. not a list\n\n\\# not a heading");
  assert.equal(r.discord, "1\\. not a list\n\n\\# not a heading");
  assert.equal(r.plain, "1. not a list\n\n# not a heading");
});

t("every newline is a line break", () => {
  const r = C("line one\nline two");
  assert.equal(r.plain, "line one\nline two");
  assert.match(r.html, /<br>/);
});

t("free vision model filter and ranking", () => {
  const m = (id, created, ctx, inp, pr = "0", out = ["text"]) => ({
    id, created, context_length: ctx,
    pricing: { prompt: pr, completion: pr }, architecture: { input_modalities: inp, output_modalities: out },
  });
  const got = pickFreeVisionModels([
    m("a/old:free", 10, 1000, ["text", "image"]),
    m("a/new:free", 20, 1000, ["text", "image"]),
    m("a/new-big:free", 20, 9000, ["image", "text"]),
    m("a/textonly:free", 30, 1000, ["text"]),
    m("a/paid", 40, 1000, ["text", "image"], "0.000001"),
    m("n/content-safety:free", 50, 1000, ["text", "image"]),
    m("g/lyria-3", 50, 1000, ["text", "image"]),
    m("x/imagegen:free", 50, 1000, ["text", "image"], "0", ["image"]),
    m("openrouter/free", 60, 1000, ["text", "image"]),
  ]).map((x) => x.id);
  assert.deepEqual(got, ["a/new-big:free", "a/new:free", "a/old:free"]);
});

t("cer", () => {
  assert.equal(cer("abc", "abc"), 0);
  assert.equal(cer("abd", "abc"), 1 / 3);
  assert.equal(cer("a  b\nc", "a b c"), 0);
  assert.equal(cer("🚀x", "🚀"), 1); // emoji count as one character
});

t("probe scoring", () => {
  const spec = JSON.parse(fs.readFileSync(new URL("../web/probe.json", import.meta.url), "utf8"));
  const perfect = "## Team Update 🚀\n\nHi all, the **release is on Friday**. Please *double-check* the ~~old~~ new checklist ✅.\n\n" +
    "- Tests: **142 passed**, 3 skipped\n- Budget: $12,480.50 (↑ 4.2%)\n\n| Name | Role | Status |\n|---|---|---|\n| Ana | QA | ✅ Done |\n| Raj | Dev | ⏳ In progress |\n\n" +
    "Invoice #A-20931 is due 2026-11-15; contact ops@example.com or call +1 (555) 013-2244 before 5 pm.";
  const s = scoreTranscription(markdownit, perfect, spec);
  assert.ok(Math.abs(s.total - 100) < 1e-9, JSON.stringify(s));
  const flat = perfect.replace(/\*\*|~~/g, "").replace(/[🚀✅⏳]/gu, "");
  const f = scoreTranscription(markdownit, flat, spec);
  assert.equal(f.parts.bold, 0); assert.equal(f.parts.strike, 0); assert.equal(f.parts.emoji, 0);
  assert.equal(f.parts.italic, 8); assert.equal(f.parts.table, 8);
  assert.ok(f.parts.text > 55 && f.parts.text < 60);
});

console.log(`\n${n} tests passed`);
