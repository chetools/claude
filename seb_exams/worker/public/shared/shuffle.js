// The student page's per-student deterministic shuffle, copied from student/index.html (rng, shuffle, render()).
// It must stay identical to that page: tests/submissions_mock.cjs loads the real student page and compares.
//   rng(seed)                       -> () => number in [0,1)   (FNV-1a seed + xorshift32)
//   shuffle(array, r)               -> shuffled copy (Fisher-Yates, same draw order as the student page)
//   normalizeStudentId(id)          -> trimmed, upper-cased (as the student page and the server store it)
//   studentOrder(exam, examId, studentId)
//        -> {questionIds: [qid...], optionOrder: {mcQid: [optionId...]}}
// `exam` is the public exam or the stored content: only question type, id, shuffle_options and options are used.
// Option ids are `a, b, c ...` in file order (taken from option.id when present, else from the position).

export const SECTIONS = [["mc", "Multiple choice"], ["fill", "Fill in the blank"], ["open", "Open-ended"]];

export function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = h >>> 0 || 1;
  return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return (h % 1e9) / 1e9; };
}

export function shuffle(a, r) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const normalizeStudentId = (id) => String(id ?? "").trim().toUpperCase();

export function studentOrder(exam, examId, studentId) {
  // One generator for the whole page: section shuffles and option shuffles draw from it in display order.
  const r = rng(examId + "|" + normalizeStudentId(studentId));
  const questionIds = [];
  const optionOrder = {};
  const questions = (exam && exam.questions) || [];
  for (const [type] of SECTIONS) {
    const qs = shuffle(questions.filter((q) => q.type === type), r);
    for (const q of qs) {
      questionIds.push(q.id);
      if (q.type === "mc") {
        const opts = (q.options || []).map((o, j) => ({ id: o.id !== undefined ? o.id : String.fromCharCode(97 + j) }));
        const list = (q.shuffle_options === false || q.shuffle === false) ? opts : shuffle(opts, r);
        optionOrder[q.id] = list.map((o) => o.id);
      }
    }
  }
  return { questionIds, optionOrder };
}
