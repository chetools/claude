// Exam file validation, grading and SEB helpers. Plain ES module without dependencies: the Worker
// imports it (authoritative check) and the teacher app runs the same code in the browser.
//
//   validateExam(obj, imageNames) -> {exam, errors, warnings}   obj = parsed exam.yaml
//   fillPattern(blank)            -> "_a__-___"                 clue, or answer with letters/digits as "_"
//   gradeSubmission(exam, answers)-> {detail, score, max}       mc + fill; open questions are not graded
//   publicExam(exam, images, id?) -> object for students        never contains answers
//   sanitizeSvgCheck(text)        -> error message | null
//   sebJson(value) / sebSettings(examId, quitPasswordSha256)    SEB Config Key input

const STUDENT_PAGE = "https://chetools.github.io/claude/seb_exams/exam/";
const QUIT_URL = "https://chetools.github.io/claude/seb_exams/exam/done.html";

const MAX_TEXT = 20000;
const MAX_QUESTIONS = 100;
const MAX_IMAGES = 20;
const IMAGE_EXT = ["svg", "png", "jpg", "jpeg", "webp"];
const TOP_KEYS = ["format", "title", "duration_minutes", "intro", "questions"];
const COMMON_KEYS = ["id", "type", "points", "text", "image", "image_alt"];
const TYPE_KEYS = {
  mc: ["shuffle_options", "options"],
  fill: ["blanks"],
  open: ["model_answer"],
};
const OPEN_VERB = /\b(calculate|compute|derive|derivation|show that|prove|solve|evaluate|work out|sketch|draw|plot)\b/i;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isSep = (c) => c === " " || c === "-";
const quote = (s) => `"${s}"`;

function unknownKeys(obj, allowed) {
  return Object.keys(obj).filter((k) => !allowed.includes(k));
}

// Checks a text field; returns the string or undefined (error recorded).
function textField(v, where, field, errors, { required = true } = {}) {
  if (v === undefined || v === null) {
    if (required) errors.push(`${where}: ${field} is missing.`);
    return undefined;
  }
  if (typeof v !== "string") {
    errors.push(`${where}: ${field} must be text (got ${Array.isArray(v) ? "a list" : typeof v}).`);
    return undefined;
  }
  if (v.length > MAX_TEXT) {
    errors.push(`${where}: ${field} has ${v.length} characters; the limit is ${MAX_TEXT}.`);
    return undefined;
  }
  if (required && !v.trim()) {
    errors.push(`${where}: ${field} is empty.`);
    return undefined;
  }
  return v;
}

export function validateExam(obj, imageNames) {
  const errors = [];
  const warnings = [];
  const names = Array.isArray(imageNames) ? imageNames : [];
  const fail = () => ({ exam: null, errors, warnings });

  if (!isObj(obj)) {
    errors.push("Exam: the file must be a mapping with format, title, duration_minutes and questions.");
    return fail();
  }
  const W = "Exam";
  for (const k of unknownKeys(obj, TOP_KEYS)) {
    errors.push(`${W}: unknown field ${quote(k)}. Allowed fields: ${TOP_KEYS.join(", ")}.`);
  }
  if (obj.format !== "seb-exam/1") {
    errors.push(`${W}: format must be "seb-exam/1" (got ${obj.format === undefined ? "nothing" : quote(String(obj.format))}).`);
  }
  let title = textField(obj.title, W, "title", errors);
  if (title !== undefined) {
    title = title.trim();
    if (title.length > 200) { errors.push(`${W}: title has ${title.length} characters; the limit is 200.`); title = undefined; }
  }
  const dur = obj.duration_minutes;
  if (!Number.isInteger(dur) || dur < 1 || dur > 600) {
    errors.push(`${W}: duration_minutes must be a whole number from 1 to 600 (got ${dur === undefined ? "nothing" : quote(String(dur))}).`);
  }
  const intro = obj.intro === undefined || obj.intro === null ? undefined : textField(obj.intro, W, "intro", errors, { required: false });

  if (names.length > MAX_IMAGES) errors.push(`${W}: ${names.length} images; the limit is ${MAX_IMAGES}.`);
  for (const n of names) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(n)) {
      errors.push(`Image ${quote(n)}: file names may only use letters, digits, dot, hyphen and underscore (max 100 characters), and no folders.`);
    } else if (!IMAGE_EXT.includes(n.split(".").pop().toLowerCase())) {
      errors.push(`Image ${quote(n)}: type not allowed; use ${IMAGE_EXT.join(", ")}.`);
    }
  }

  const qs = obj.questions;
  const questions = [];
  if (!Array.isArray(qs) || qs.length === 0) {
    errors.push(`${W}: questions must be a list with at least one question.`);
  } else if (qs.length > MAX_QUESTIONS) {
    errors.push(`${W}: ${qs.length} questions; the limit is ${MAX_QUESTIONS}.`);
  } else {
    const used = new Set();
    for (const q of qs) if (isObj(q) && typeof q.id === "string") used.add(q.id);
    const seen = new Set();
    const referenced = new Set();
    qs.forEach((q, i) => {
      const nq = checkQuestion(q, i, names, errors, warnings, used, seen, referenced);
      questions.push(nq);
    });
    for (const n of names) {
      if (!referenced.has(n)) warnings.push(`Image ${quote(n)} is not used by any question.`);
    }
  }

  if (errors.length) return fail();
  const exam = { format: "seb-exam/1", title, duration_minutes: dur };
  if (intro !== undefined && intro.trim()) exam.intro = intro;
  exam.questions = questions;
  return { exam, errors, warnings };
}

function checkQuestion(q, i, names, errors, warnings, used, seen, referenced) {
  const n = i + 1;
  if (!isObj(q)) {
    errors.push(`Question ${n}: must be a mapping with type, points and text.`);
    return null;
  }
  const type = q.type;
  if (type !== "mc" && type !== "fill" && type !== "open") {
    errors.push(`Question ${n}: type must be mc, fill or open (got ${type === undefined ? "nothing" : quote(String(type))}).`);
    return null;
  }
  const W = `Question ${n} (${type})`;
  const allowed = [...COMMON_KEYS, ...TYPE_KEYS[type]];
  for (const k of unknownKeys(q, allowed)) {
    const other = Object.keys(TYPE_KEYS).find((t) => TYPE_KEYS[t].includes(k));
    errors.push(`${W}: unknown field ${quote(k)}${other ? ` (it belongs to ${other} questions)` : ""}. Allowed fields: ${allowed.join(", ")}.`);
  }

  // id
  let id = q.id;
  if (id === undefined || id === null) {
    let k = n;
    id = `q${k}`;
    while (used.has(id)) id = `q${++k}`;
    used.add(id);
  } else if (typeof id !== "string" || !/^[a-z0-9-]{1,40}$/.test(id)) {
    errors.push(`${W}: id must be 1 to 40 characters from a-z, 0-9 and hyphen (got ${quote(String(id))}).`);
    id = undefined;
  } else if (seen.has(id)) {
    errors.push(`${W}: id ${quote(id)} is used by more than one question.`);
  }
  if (typeof id === "string") seen.add(id);

  const points = q.points;
  if (typeof points !== "number" || !Number.isFinite(points) || points <= 0) {
    errors.push(`${W}: points must be a number greater than 0 (got ${points === undefined ? "nothing" : quote(String(points))}).`);
  }
  const text = textField(q.text, W, "text", errors);

  // image
  let image, imageAlt;
  if (q.image !== undefined && q.image !== null) {
    if (typeof q.image !== "string" || !q.image) {
      errors.push(`${W}: image must be a file name.`);
    } else if (!names.includes(q.image)) {
      errors.push(`${W}: image ${quote(q.image)} is not in the zip file.`);
    } else {
      image = q.image;
      referenced.add(image);
      imageAlt = textField(q.image_alt, W, "image_alt (required when an image is given)", errors);
    }
  } else if (q.image_alt !== undefined && q.image_alt !== null) {
    warnings.push(`${W}: image_alt is ignored because the question has no image.`);
  }

  const out = { id, type, points, text };
  if (image !== undefined) { out.image = image; out.image_alt = imageAlt; }

  if (type === "mc") {
    if (q.shuffle_options !== undefined && typeof q.shuffle_options !== "boolean") {
      errors.push(`${W}: shuffle_options must be true or false.`);
    }
    out.shuffle_options = q.shuffle_options === undefined ? true : q.shuffle_options !== false;
    out.options = checkOptions(q.options, W, errors);
  } else if (type === "fill") {
    out.blanks = checkBlanks(q.blanks, text, W, errors);
  } else {
    if (q.model_answer !== undefined && q.model_answer !== null) {
      const m = textField(q.model_answer, W, "model_answer", errors, { required: false });
      if (m !== undefined && m.trim()) out.model_answer = m;
    }
    if (text !== undefined && (OPEN_VERB.test(text) || text.includes("$$"))) {
      warnings.push(`${W}: Open questions should ask for an explanation in words; students cannot type equations or attach drawings.`);
    }
  }
  return out;
}

function checkOptions(opts, W, errors) {
  if (!Array.isArray(opts)) {
    errors.push(`${W}: options must be a list of 2 to 8 options.`);
    return [];
  }
  if (opts.length < 2 || opts.length > 8) {
    errors.push(`${W}: has ${opts.length} options; it needs 2 to 8.`);
    return [];
  }
  const out = [];
  let correct = 0;
  opts.forEach((o, j) => {
    const O = `${W}: option ${j + 1}`;
    if (!isObj(o)) { errors.push(`${O} must be a mapping with text (and correct: true for the right one).`); return; }
    for (const k of unknownKeys(o, ["text", "correct"])) {
      errors.push(`${O}: unknown field ${quote(k)}. Allowed fields: text, correct.`);
    }
    const t = textField(o.text, O.replace(": option", ", option"), "text", errors);
    if (o.correct !== undefined && typeof o.correct !== "boolean") errors.push(`${O}: correct must be true or false.`);
    const c = o.correct === true;
    if (c) correct++;
    out.push({ text: t, correct: c });
  });
  if (correct !== 1) errors.push(`${W}: exactly one option must be marked correct: true (found ${correct}).`);
  return out;
}

// Positions where the answer is a separator must hold the same separator in `other`, and vice versa.
function sepMismatch(answer, other) {
  for (let k = 0; k < answer.length; k++) {
    if (isSep(answer[k]) !== isSep(other[k]) || (isSep(answer[k]) && answer[k] !== other[k])) return k;
  }
  return -1;
}

function checkBlanks(blanks, text, W, errors) {
  const markers = [...(text || "").matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]));
  if (!Array.isArray(blanks) || blanks.length === 0) {
    errors.push(`${W}: blanks must be a list with one entry for each [[n]] marker in the text.`);
    return [];
  }
  if (blanks.length > 50) { errors.push(`${W}: ${blanks.length} blanks; the limit is 50.`); return []; }
  if (text !== undefined) {
    if (markers.length !== blanks.length) {
      errors.push(`${W}: the text has ${markers.length} [[n]] markers but ${blanks.length} blanks are defined.`);
    } else if (markers.some((m, k) => m !== k + 1)) {
      errors.push(`${W}: the markers must be numbered [[1]], [[2]], ... in order (found ${markers.map((m) => `[[${m}]]`).join(" ")}).`);
    }
  }
  const out = [];
  blanks.forEach((b, j) => {
    const B = `${W}: blank ${j + 1}`;
    if (!isObj(b)) { errors.push(`${B} must be a mapping with answer (and optionally variants and clue).`); return; }
    for (const k of unknownKeys(b, ["answer", "variants", "clue"])) {
      errors.push(`${B}: unknown field ${quote(k)}. Allowed fields: answer, variants, clue.`);
    }
    if (typeof b.answer !== "string") {
      errors.push(`${B}: answer is missing or not text.`);
      return;
    }
    const answer = b.answer.trim();
    if (!answer || !/^[A-Za-z0-9 -]+$/.test(answer) || !/[A-Za-z0-9]/.test(answer)) {
      errors.push(`${B}: answer ${quote(b.answer)} may only contain letters, digits, spaces and hyphens, with at least one letter or digit.`);
      return;
    }
    const res = { answer, variants: [] };
    let bad = false;
    if (b.variants !== undefined && b.variants !== null) {
      if (!Array.isArray(b.variants) || b.variants.some((v) => typeof v !== "string")) {
        errors.push(`${B}: variants must be a list of text values.`);
        bad = true;
      } else {
        for (const raw of b.variants) {
          const v = raw.trim();
          if (v.length !== answer.length) {
            errors.push(`${B} variant ${quote(v)} has ${v.length} characters but the answer has ${answer.length}.`);
            bad = true;
          } else if (!/^[A-Za-z0-9 -]+$/.test(v)) {
            errors.push(`${B} variant ${quote(v)} may only contain letters, digits, spaces and hyphens.`);
            bad = true;
          } else {
            const k = sepMismatch(answer, v);
            if (k >= 0) {
              errors.push(`${B} variant ${quote(v)} has a different separator (space or hyphen) than the answer at position ${k + 1}.`);
              bad = true;
            } else res.variants.push(v);
          }
        }
      }
    }
    if (b.clue !== undefined && b.clue !== null) {
      if (typeof b.clue !== "string") {
        errors.push(`${B}: clue must be text.`);
        bad = true;
      } else if (b.clue.length !== answer.length) {
        errors.push(`${B}: clue ${quote(b.clue)} has ${b.clue.length} characters but the answer has ${answer.length}.`);
        bad = true;
      } else {
        const clue = b.clue;
        const all = [answer, ...res.variants];
        for (let k = 0; k < clue.length && !bad; k++) {
          const c = clue[k];
          if (isSep(answer[k])) {
            if (c !== answer[k]) { errors.push(`${B}: clue has ${quote(c)} at position ${k + 1} where the answer has a separator ${quote(answer[k])}; the separator must appear in the clue at the same position.`); bad = true; }
          } else if (c === "_") {
            // box to fill
          } else if (!/[A-Za-z0-9]/.test(c)) {
            errors.push(`${B}: clue character ${quote(c)} at position ${k + 1} is not allowed; use "_" for a box or the letter to show.`);
            bad = true;
          } else {
            for (const a of all) {
              if (a[k].toLowerCase() !== c.toLowerCase()) {
                errors.push(`${B}: clue shows ${quote(c)} at position ${k + 1} but ${a === answer ? "the answer" : `variant ${quote(a)}`} has ${quote(a[k])} there; shown letters must be identical in the answer and every variant.`);
                bad = true;
                break;
              }
            }
          }
        }
        if (!bad && ![...clue].some((c, k) => c === "_" && !isSep(answer[k]))) {
          errors.push(`${B}: clue ${quote(clue)} has no "_" box left for the student to fill.`);
          bad = true;
        }
        if (!bad) res.clue = clue;
      }
    }
    if (!bad) out.push(res);
  });
  return out;
}

export function fillPattern(blank) {
  if (blank.clue) return blank.clue;
  return blank.answer.replace(/[A-Za-z0-9]/g, "_");
}

export function gradeSubmission(exam, answers) {
  const ans = isObj(answers) ? answers : {};
  const detail = {};
  let score = 0;
  let max = 0;
  for (const q of exam.questions) {
    if (q.type === "open") continue;
    const a = ans[q.id];
    let ok = false;
    if (q.type === "mc") {
      const idx = q.options.findIndex((o) => o.correct);
      ok = typeof a === "string" && a === String.fromCharCode(97 + idx);
    } else {
      ok = Array.isArray(a) && a.length === q.blanks.length && q.blanks.every((b, j) => {
        const s = typeof a[j] === "string" ? a[j].trim().toLowerCase() : null;
        return s !== null && [b.answer, ...(b.variants || [])].some((x) => x.toLowerCase() === s);
      });
    }
    const points = ok ? q.points : 0;
    detail[q.id] = { ok, points };
    score += points;
    max += q.points;
  }
  return { detail, score, max };
}

export function publicExam(exam, images, examId) {
  const imgs = images || {};
  return {
    id: examId !== undefined ? examId : exam.id ?? null,
    title: exam.title,
    intro: exam.intro || "",
    duration_minutes: exam.duration_minutes,
    questions: exam.questions.map((q) => {
      const p = {
        id: q.id, type: q.type, points: q.points, text: q.text,
        image: q.image ? imgs[q.image] || null : null,
        image_alt: q.image ? q.image_alt : "",
      };
      if (q.type === "mc") {
        p.shuffle_options = q.shuffle_options !== false;
        p.options = q.options.map((o, j) => ({ id: String.fromCharCode(97 + j), text: o.text }));
      } else if (q.type === "fill") {
        p.blanks = q.blanks.map((b) => ({ pattern: fillPattern(b) }));
      }
      return p;
    }),
  };
}

export function sanitizeSvgCheck(text) {
  if (typeof text !== "string") return "The SVG is not text.";
  if (!/<svg[\s>]/i.test(text)) return "The file does not look like an SVG image (no <svg> element).";
  if (/<script/i.test(text)) return "The SVG contains a <script> element, which is not allowed.";
  if (/[\s"'/<]on[a-z]+\s*=/i.test(text)) return "The SVG contains an event handler attribute (such as onload=), which is not allowed.";
  if (/javascript:/i.test(text)) return "The SVG contains a javascript: link, which is not allowed.";
  if (/<foreignObject/i.test(text)) return "The SVG contains a <foreignObject> element, which is not allowed.";
  const re = /(?:^|[\s"'/])(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(text))) {
    const v = (m[1] ?? m[2] ?? m[3] ?? "").trim().toLowerCase();
    if (!v.startsWith("#") && !v.startsWith("data:image/")) {
      return `The SVG contains a link to ${quote((m[1] ?? m[2] ?? m[3] ?? "").trim().slice(0, 60))}; only links to #ids and data:image/ are allowed.`;
    }
  }
  return null;
}

// SEB-JSON (safeexambrowser.org/developer/seb-config-key.html): keys sorted case-insensitively at every
// level, no whitespace, no escaping, empty dictionaries removed from dictionaries.
export function sebJson(v) {
  if (Array.isArray(v)) return "[" + v.map(sebJson).join(",") + "]";
  if (isObj(v)) {
    const items = Object.entries(v).filter(([, x]) => !(isObj(x) && Object.keys(x).length === 0));
    items.sort((a, b) => { const x = a[0].toLowerCase(), y = b[0].toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; });
    return "{" + items.map(([k, x]) => `"${k}":${sebJson(x)}`).join(",") + "}";
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" && Number.isInteger(v)) return String(v);
  if (typeof v === "string") return `"${v}"`;
  throw new Error("SEB setting of unsupported type " + typeof v);
}

export function sebSettings(examId, quitPasswordSha256) {
  const pw = quitPasswordSha256 || "";
  if (pw && !/^[0-9a-f]{64}$/.test(pw)) throw new Error("quit password hash must be 64 lower-case hex characters");
  if (!/^[a-z0-9-]+$/.test(examId)) throw new Error("bad exam id");
  const prefix = STUDENT_PAGE.replace(/\./g, "\\.");
  return {
    sebConfigPurpose: 0,                 // configure a client for starting an exam
    startURL: STUDENT_PAGE + "?id=" + examId,
    sendBrowserExamKey: true,            // Config Key in HTTP headers (older SEB versions)
    browserWindowWebView: 3,             // "Prefer Modern": SEB JavaScript API for the Config Key
    URLFilterEnable: true,
    URLFilterEnableContentFilter: false, // a content filter would disable the JS API on macOS/iOS
    URLFilterRules: [{ action: 1, active: true, expression: `^${prefix}.*`, regex: true }],
    allowQuit: true,
    hashedQuitPassword: pw,              // proctor's password to quit before submitting
    quitURL: QUIT_URL,                   // the "Quit Safe Exam Browser" link after submission
    quitURLConfirm: true,
  };
}
