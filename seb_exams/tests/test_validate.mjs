// Unit tests for worker/public/shared/validate.js. Run: node --test tests/test_validate.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { validateExam, fillPattern, gradeSubmission, publicExam, sanitizeSvgCheck, sebJson, sebSettings }
  from "../worker/public/shared/validate.js";

const base = () => ({
  format: "seb-exam/1", title: "T", duration_minutes: 30,
  questions: [
    { id: "a", type: "mc", points: 2, text: "Pick", options: [{ text: "x", correct: true }, { text: "y" }] },
    { type: "fill", points: 2, text: "Heat of [[1]] and [[2]].",
      blanks: [{ answer: "vaporization", variants: ["vaporisation"], clue: "_a__________" }, { answer: "ice-cold" }] },
    { type: "open", points: 5, text: "Explain why." },
  ],
});
const withQ = (i, patch) => { const o = base(); Object.assign(o.questions[i], patch); return o; };
const errs = (o, imgs = []) => validateExam(o, imgs).errors;
const has = (o, re, imgs) => assert.ok(errs(o, imgs).some((e) => re.test(e)), `expected ${re}, got ${JSON.stringify(errs(o, imgs))}`);

test("valid exam is normalized", () => {
  const r = validateExam(base(), []);
  assert.deepEqual(r.errors, []);
  assert.equal(r.exam.questions[1].id, "q2");
  assert.equal(r.exam.questions[0].shuffle_options, true);
  assert.equal(r.exam.questions[1].blanks[1].variants.length, 0);
});

test("each error class fires", () => {
  const o = base(); o.extra = 1; has(o, /unknown field "extra"/);
  has({ ...base(), format: "x" }, /format must be/);
  has({ ...base(), title: "" }, /title is empty/);
  has({ ...base(), duration_minutes: 0 }, /duration_minutes/);
  has({ ...base(), duration_minutes: 601 }, /duration_minutes/);
  has({ ...base(), questions: [] }, /at least one question/);
  has({ ...base(), questions: Array(101).fill(base().questions[2]) }, /101 questions/);
  has(withQ(0, { type: "zzz" }), /Question 1: type must be/);
  has(withQ(0, { foo: 1 }), /Question 1 \(mc\): unknown field "foo"/);
  has(withQ(0, { blanks: [] }), /"blanks" \(it belongs to fill/);
  has(withQ(0, { points: 0 }), /Question 1 \(mc\): points/);
  has(withQ(0, { text: "" }), /Question 1 \(mc\): text/);
  has(withQ(0, { text: "a".repeat(20001) }), /20001 characters/);
  has(withQ(0, { id: "Bad Id" }), /id must be/);
  has(withQ(1, { id: "a" }), /id "a" is used by more than one/);
  has(withQ(0, { options: [{ text: "x", correct: true }] }), /needs 2 to 8/);
  has(withQ(0, { options: [{ text: "x" }, { text: "y" }] }), /exactly one option.*found 0/);
  has(withQ(0, { options: [{ text: "x", correct: true }, { text: "y", correct: true }] }), /found 2/);
  has(withQ(0, { options: [{ text: "x", correct: true }, { text: "y", wrong: 1 }] }), /option 2: unknown field/);
  has(withQ(0, { shuffle_options: "yes" }), /shuffle_options/);
  has(withQ(0, { image: "nope.png", image_alt: "a" }), /not in the zip/);
  has(withQ(0, { image: "p.png" }), /image_alt/, ["p.png"]);
  has(base(), /Image "x.gif": type not allowed/, ["x.gif"]);
  has(withQ(1, { text: "only [[1]]" }), /2 blanks|1 \[\[n\]\] markers but 2 blanks/);
  has(withQ(1, { text: "[[2]] [[1]]" }), /numbered \[\[1\]\]/);
  has(withQ(1, { blanks: [] }), /blanks must be a list/);
  has(withQ(2, { model_answer: 5 }), /model_answer must be text/);
});

test("fill blank errors name question and blank", () => {
  const o = withQ(1, { blanks: [{ answer: "vaporization", variants: ["vapourisation"] }, { answer: "ice-cold" }] });
  assert.ok(errs(o).includes('Question 2 (fill): blank 1 variant "vapourisation" has 13 characters but the answer has 12.'), errs(o).join("|"));
  has(withQ(1, { blanks: [{ answer: "a_b" }, { answer: "x" }] }), /blank 1: answer/);
  has(withQ(1, { blanks: [{ answer: "ab", extra: 1 }, { answer: "x" }] }), /blank 1: unknown field "extra"/);
  has(withQ(1, { blanks: [{ answer: "ice-cold", variants: ["ice cold"] }, { answer: "x" }] }), /different separator/);
});

test("clue and variant mismatches", () => {
  const clue = (c, v) => withQ(1, { blanks: [{ answer: "vaporization", variants: v || [], clue: c }, { answer: "x" }] });
  has(clue("_a_"), /clue "_a_" has 3 characters/);
  has(clue("_b__________"), /clue shows "b" at position 2 but the answer has "a"/);
  has(clue("_a__________", ["vopourisatio1"]), /variant "vopourisatio1".*(has "o"|has "1")|variant/);
  has(clue("_a__________", ["vxporisation1"].slice(0, 0).concat(["vxporisation"])), /variant "vxporisation" has "x"/);
  has(clue("????????????"), /not allowed/);
  has(clue("vaporization"), /no "_" box/);
  has(withQ(1, { blanks: [{ answer: "ice-cold", clue: "___ ____" }, { answer: "x" }] }), /separator/);
  assert.deepEqual(errs(withQ(1, { blanks: [{ answer: "ice-cold", clue: "i__-c___" }, { answer: "x" }] })), []);
});

test("warnings: open questions, unused images", () => {
  const w = (o, imgs) => validateExam(o, imgs).warnings;
  assert.ok(w(withQ(2, { text: "Calculate the flow." }))[0].includes("explanation in words"));
  assert.ok(w(withQ(2, { text: "Why? $$x=1$$" }))[0].includes("explanation in words"));
  assert.equal(w(base()).length, 0);
  assert.ok(w(base(), ["unused.png"])[0].includes("not used"));
});

test("fillPattern", () => {
  assert.equal(fillPattern({ answer: "ice-cold" }), "___-____");
  assert.equal(fillPattern({ answer: "heat of", clue: "h___ __" }), "h___ __");
});

test("grading: mc, fill all-or-nothing, case, variants, trimming", () => {
  const { exam } = validateExam(base(), []);
  const g = (a) => gradeSubmission(exam, a);
  let r = g({ a: "a", q2: ["VAPORISATION ", "Ice-Cold"], q3: "text" });
  assert.equal(r.score, 4); assert.equal(r.max, 4);
  assert.equal(r.detail.q3, undefined);
  r = g({ a: "b", q2: ["vaporization", "ice-colt"] });
  assert.equal(r.score, 0); assert.deepEqual(r.detail.a, { ok: false, points: 0 });
  assert.equal(r.detail.q2.ok, false);
  r = g({ q2: ["_a__________", "___-____"] }); assert.equal(r.score, 0);
  r = g(null); assert.equal(r.score, 0); assert.equal(r.max, 4);
  r = g({ q2: ["vaporization"] }); assert.equal(r.detail.q2.ok, false);
});

test("publicExam never leaks answers", () => {
  const o = base(); o.questions[2].model_answer = "SECRETMODEL";
  const { exam } = validateExam(o, []);
  const p = publicExam(exam, {}, "mt-aaaaaa");
  const s = JSON.stringify(p);
  for (const bad of ["SECRETMODEL", "correct", "vaporization", "vaporisation", "ice-cold", "variants"]) assert.ok(!s.includes(bad), bad);
  assert.equal(p.id, "mt-aaaaaa");
  assert.deepEqual(p.questions[0].options.map((x) => x.id), ["a", "b"]);
  assert.equal(p.questions[1].blanks[0].pattern, "_a__________");
  assert.equal(p.questions[1].blanks[1].pattern, "___-____");
});

test("SVG check", () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"/><image href="data:image/png;base64,AA"/></svg>';
  assert.equal(sanitizeSvgCheck(ok), null);
  const bad = (s) => assert.ok(sanitizeSvgCheck(s), s);
  bad('<svg><script>alert(1)</script></svg>');
  bad('<svg onload="x()"></svg>');
  bad('<svg><a xlink:href="javascript:alert(1)"><text/></a></svg>');
  bad('<svg><foreignObject><div/></foreignObject></svg>');
  bad('<svg><image href="https://evil.example/x.png"/></svg>');
  bad('<svg><a href="//evil.example"><text/></a></svg>');
  bad('<html></html>');
  const mpl = fs.readFileSync(new URL("../examples/example-exam/vapour-pressure.svg", import.meta.url), "utf8");
  assert.match(mpl, /standalone="no"/);
  assert.equal(sanitizeSvgCheck(mpl), null, "real matplotlib SVG must pass");
});

// Expected values computed with the v1 build.py (seb_json / seb_settings), see the task notes.
const V1_DICT = {"sebConfigPurpose": 0, "startURL": "https://chetools.github.io/claude/seb_exams/exam/", "sendBrowserExamKey": true, "browserWindowWebView": 3, "URLFilterEnable": true, "URLFilterEnableContentFilter": false, "URLFilterRules": [{"action": 1, "active": true, "expression": "^https://chetools\\.github\\.io/claude/seb_exams/exam/.*", "regex": true}], "allowQuit": true, "hashedQuitPassword": "", "quitURL": "https://chetools.github.io/claude/seb_exams/exam/done.html", "quitURLConfirm": true};
const V1_JSON = '{"allowQuit":true,"browserWindowWebView":3,"hashedQuitPassword":"","quitURL":"https://chetools.github.io/claude/seb_exams/exam/done.html","quitURLConfirm":true,"sebConfigPurpose":0,"sendBrowserExamKey":true,"startURL":"https://chetools.github.io/claude/seb_exams/exam/","URLFilterEnable":true,"URLFilterEnableContentFilter":false,"URLFilterRules":[{"action":1,"active":true,"expression":"^https://chetools\\.github\\.io/claude/seb_exams/exam/.*","regex":true}]}';
const V1_HEX = "c27f4a12e70cfbefd3d7438e387d1728b4270d870ba958101b11cef76f225124";
const V2_HEX = "ee8a69a8b4e8d1cbed05561c92c59758f82e2543905d7198feb017bcc7bb24e4";
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

test("sebJson equals the v1 build.py output", () => {
  assert.equal(sebJson(V1_DICT), V1_JSON);
  assert.equal(sha(sebJson(V1_DICT)), V1_HEX);
  assert.equal(sebJson({ Zeta: { b: 1, A: [true, { x: {} }], c: 'é"q' }, alpha: {}, Beta: -3 }), '{"Beta":-3,"Zeta":{"A":[true,{}],"b":1,"c":"é"q"}}');
  assert.throws(() => sebJson({ a: 1.5 }));
});

test("sebSettings: v1 settings with the v2 start and quit URLs", () => {
  const s = sebSettings("mt-7k2p9x", "");
  assert.equal(sha(sebJson(s)), V2_HEX);
  assert.equal(s.startURL, "https://chetools.github.io/claude/seb_exams/exam/?id=mt-7k2p9x");
  assert.equal(sebSettings("mt-7k2p9x", "a".repeat(64)).hashedQuitPassword, "a".repeat(64));
  assert.throws(() => sebSettings("mt-7k2p9x", "xyz"));
});
