// Made-up submissions for practice exams, so teachers can try the Grade, Submissions and Results tabs.
// Deterministic for a given exam id: twelve students from strong to weak, one late, one third of the essays graded.
import { fillPattern, gradeSubmission } from "../public/shared/validate.js";

const NAMES = ["Avery Lin", "Blake Moreno", "Casey Okafor", "Devon Price", "Emery Novak", "Finley Haddad",
  "Gray Tanaka", "Harper Silva", "Indy Kowalski", "Jordan Mensah", "Kai Larsen", "Logan Rivera"];
const QUALITY = [0.97, 0.92, 0.86, 0.8, 0.72, 0.65, 0.58, 0.5, 0.42, 0.33, 0.22, 0.1];
const VAGUE = ["I think it has to do with the temperature and the pressure.",
  "It changes because of the conditions, so the result is different.",
  "Not sure. Something about energy."];
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function rng(seed) {  // mulberry32 seeded from a string
  let h = 1779033703;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One blank as the student page sends it: full pattern length, "_" for empty boxes, clue letters kept.
function fillAnswer(blank, q, r) {
  const pat = fillPattern(blank);
  const word = blank.variants && blank.variants.length && r() < 0.3 ? blank.variants[0] : blank.answer;
  const roll = r();
  return [...pat].map((p, i) => {
    if (p !== "_") return p;                                    // clue letter or separator
    if (roll < q) return word[i];                               // right
    if (roll < q + 0.15) return r() < 0.5 ? "_" : word[i];      // half filled
    return LETTERS[Math.floor(r() * 26)];                       // wrong
  }).join("");
}

function essay(question, q, r) {
  const model = String(question.model_answer || "").replace(/\s+/g, " ").trim();
  const sentences = model.match(/[^.!?]+[.!?]+/g) || (model ? [model] : []);
  if (q < 0.2) return r() < 0.5 ? "" : VAGUE[Math.floor(r() * VAGUE.length)];
  if (!sentences.length) return VAGUE[Math.floor(r() * VAGUE.length)];
  const n = Math.max(1, Math.round(sentences.length * Math.min(1, q + 0.1 * (r() - 0.5))));
  return sentences.slice(0, n).join(" ").trim() + (q < 0.5 ? " " + VAGUE[Math.floor(r() * VAGUE.length)] : "");
}

// Rows for the submissions table of a practice exam that opened at opensMs.
export function practiceSubmissions(exam, examId, opensMs, receiptFn) {
  const r = rng("practice:" + examId);
  const durMs = exam.duration_minutes * 60000;
  return NAMES.map((name, k) => {
    const q = QUALITY[k];
    const answers = {};
    for (const qu of exam.questions) {
      if (qu.type === "mc") {
        const right = qu.options.findIndex((o) => o.correct);
        const pick = r() < q ? right : (right + 1 + Math.floor(r() * (qu.options.length - 1))) % qu.options.length;
        if (q > 0.15 || r() < 0.5) answers[qu.id] = LETTERS[pick];
      } else if (qu.type === "fill") {
        answers[qu.id] = qu.blanks.map((b) => fillAnswer(b, q, r));
      } else {
        answers[qu.id] = essay(qu, q, r);
      }
    }
    const g = gradeSubmission(exam, answers);
    const manual = {};
    if (k % 3 === 0) {  // a third of the students already have their essays graded
      for (const qu of exam.questions) {
        if (qu.type === "open" && answers[qu.id]) manual[qu.id] = { points: Math.round(qu.points * q * 2) / 2, comment: "Practice grade." };
      }
    }
    const started = opensMs + Math.floor(r() * 5) * 60000;
    const late = k === 7;
    const used = late ? durMs + 4 * 60000 : Math.round(durMs * (0.5 + 0.45 * r()));
    return { student_id: "P" + String(101 + k), name, answers, detail: g.detail, score: g.score, max: g.max, manual,
      receipt: receiptFn(), started_at: new Date(started).toISOString(), submitted_at: new Date(started + used).toISOString(),
      late: late ? 1 : 0 };
  });
}
