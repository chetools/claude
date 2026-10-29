# Writing an exam with an AI tool

Most exams here are written by asking an AI tool (ChatGPT, Claude, ...) to produce a **zip file**, which you
then import in the teacher app ("Import zip") and edit if needed. This page is for you *and* for the AI tool.

**Quick start**

1. Copy the prompt in [section 11](#11-the-prompt-to-paste-into-your-ai-tool) (the "Copy prompt" button does it for you) and paste it
   into the AI tool. Replace the marked line with what you want: topic, level, number of questions, language.
2. Give the AI your material if you like (lecture notes, a formula sheet, old questions).
3. The AI writes `exam.yaml`, generates any figures, checks the exam with a script and gives you `exam.zip` to download.
4. In the teacher app press **Import zip**. If it shows errors, paste them back to the AI; it fixes them and sends a new zip.
5. Read the result in the **Questions** tab (answers are marked) and change anything you like in the **Edit** tab.
6. **Check every answer yourself.** AI tools make mistakes in chemistry and maths. A tool that runs code can verify numbers; you remain responsible.

An example you can import to see everything at work: `examples/example-exam.zip` (also downloadable from the "Write an exam with AI" page).

## 1. What the zip must contain

- `exam.yaml`, at the root of the zip (one top-level folder around it is also accepted).
- Every image file that `exam.yaml` mentions, next to it. Nothing else is needed. Unused files only give a warning.

```
exam.zip
├── exam.yaml
└── stages.svg
```

## 2. Format reference (`format: seb-exam/1`)

Unknown keys are errors (this catches typos). `exam.yaml` is YAML: indentation with spaces, no tabs.

**Whole exam**

| Key | Type | Required | Notes |
|---|---|---|---|
| `format` | text | yes | exactly `seb-exam/1` |
| `title` | text | yes | |
| `duration_minutes` | whole number | yes | 1 to 600 |
| `intro` | text (markdown + maths) | no | shown above the questions |
| `questions` | list | yes | 1 to 100 questions |

**Every question**

| Key | Type | Required | Notes |
|---|---|---|---|
| `id` | text | no | `a-z`, `0-9`, `-`, 1 to 40 characters, unique. Generated (`q1`, `q2`, ...) when missing. Useful for results. |
| `type` | `mc` / `fill` / `open` | yes | |
| `points` | number > 0 | yes | |
| `text` | text (markdown + maths) | yes | the question; at most 20 000 characters |
| `image` | file name | no | file in the zip; `.svg .png .jpg .jpeg .webp`; at most 1 MB; at most 20 images per exam |
| `image_alt` | text | **yes if `image`** | description for screen readers and for students who cannot see the figure |

**`mc` (multiple choice)** adds:

| Key | Type | Required | Notes |
|---|---|---|---|
| `options` | list of 2 to 8 | yes | each item: `text` (required) and `correct: true` (on exactly one option) |
| `shuffle_options` | true / false | no | default `true`; each student sees the options in their own order |

**`fill` (fill in the blanks)** adds:

| Key | Type | Required | Notes |
|---|---|---|---|
| `blanks` | list | yes | one entry per `[[n]]` marker in `text`, in the same order |
| `blanks[].answer` | text | yes | letters, digits, spaces, hyphens only (`[A-Za-z0-9 -]`); **quote numbers**: `"100"` |
| `blanks[].variants` | list of text | no | other accepted spellings: same length and the same spaces/hyphens positions as `answer` |
| `blanks[].clue` | text | no | same length as `answer`; `_` = a box the student fills, any other character is shown |

**`open` (explanation in words)** adds:

| Key | Type | Required | Notes |
|---|---|---|---|
| `model_answer` | text | no | only teachers see it; it helps when grading by hand |

Defaults and limits: at most 100 questions, 20 images, 20 000 characters per text field. Open questions are graded
by hand; `mc` and `fill` are graded automatically (open questions are not counted in the automatic score).

## 3. Rules, with reasons

| Rule | Reason |
|---|---|
| Use `\|` block scalars for every text field (`text`, `intro`, `title`, option `text`, `image_alt`, `model_answer`) | LaTeX has backslashes; in a block scalar they need no escaping. In quoted YAML strings `\d` or `\f` are misread or are errors. |
| Exactly one `correct: true` per `mc` question | Grading is automatic and has no partial credit for choosing among several. |
| One `[[n]]` marker per blank, numbered 1, 2, 3 ... in order | The marker is where the boxes appear; the list `blanks` is matched to it by order. |
| Fill answers are letters and digits (spaces and hyphens as fixed separators) | Students type into one box per character, so there are no other symbols, no accents, no Greek letters, no units. |
| Open questions ask for an explanation in words only | Students type plain text; they cannot enter equations or attach drawings, and there may be no pen, paper or calculator. |
| Every figure has `image_alt` | Accessibility, and a fallback if an image does not load. |
| Figures are computed with code | A hand-typed number or a hand-drawn curve in a figure is a silent error in the exam. |
| Do not put the answer in the question text or in `image_alt` | Students see both. |
| Quote YAML values that could be misread: `answer: "100"`, `clue: "_a__"`, `answer: "no"` | Unquoted `100` is a number, `no` or `yes` a boolean; `_a__` is fine but quoting is safer. |

## 4. Writing maths

- Write `$...$` for inline maths and `$$...$$` for display maths. Maths is rendered with KaTeX.
- Always use block scalars so backslashes stay as typed:

```yaml
text: |
  Dividing by $V$ and using $R = L/D$ gives

  $$y_{n+1} = \dfrac{R}{R+1}\,x_n + \dfrac{x_D}{R+1}.$$
```

- Use only commands KaTeX supports: `\frac \dfrac \sqrt \sum \int \ln \log \exp \sin \cdot \times \approx \leq \geq \rightarrow
  \alpha \Delta \partial \mathrm{...} \text{...} \bar \hat \vec ^ _`, `matrix`/`cases`/`aligned` environments, `^\circ` for degrees.
  Not supported: `\usepackage`, `\ce{...}` (chemistry), `\SI`, `\begin{tikzpicture}`, `\label`, `\newcommand` of your own.
- Chemical formulas: `$\mathrm{H_2O}$`, `$\mathrm{CO_2}$`, reactions with `\rightarrow` or `\rightleftharpoons`.
- Units in upright text: `$101.3\ \mathrm{kPa}$`.
- A literal dollar sign for money is a problem (it starts maths); write "USD 5" instead.
- Markdown works too: `**bold**`, lists, tables, blank line between paragraphs.
- Maths cannot be typed by students; it is only for the questions (and for options).

## 5. Multiple-choice questions

- Exactly **one** option is correct, and it is *unambiguously* correct for a student who knows the topic.
- Every distractor is *unambiguously wrong*, not "less good". Check each one by calculation (or by derivation): for a
  numerical question, compute the value each wrong option would come from and make sure none of them is also right
  (for example because of rounding, equivalent units or an alternative sign convention).
- Good distractors are typical mistakes: a forgotten factor, an inverted ratio, a wrong sign, a wrong unit.
- **Derivation-step questions are welcome**: give the starting equation and ask which equation follows, which
  assumption is needed, or which term is missing. They test the reasoning without needing a pen.
- Options of similar length and form; avoid "all of the above" and "none of the above".
- Don't use `correct: true` on option text that is merely longer or more detailed than the others.

```yaml
- id: solve-for-t
  type: mc
  points: 2
  text: |
    Starting from $\log_{10} P = A - \dfrac{B}{C+T}$, which expression gives $T$?
  options:
    - text: |
        $T = \dfrac{B}{A - \log_{10} P} - C$
      correct: true
    - text: |
        $T = \dfrac{B}{A + \log_{10} P} - C$
```

## 6. Fill-in-the-blank questions

The student sees **one box per character** of the answer. The `clue` decides which characters are already shown.

- Marker `[[1]]`, `[[2]]`, ... in `text`; one entry in `blanks` for each, in the same order.
- `answer`: letters, digits, spaces and hyphens. A space or hyphen is a fixed separator: the student sees a gap or a
  hyphen, not a box. Case does not matter.
- `clue`: same length as the answer. `_` means a box; any other character is shown as given.
  - Shown characters can be **anywhere**, or there can be none: `"_a__________"` (second letter), `"_____p_____"`
    (a middle letter), `"v__________n"` (first and last), or no `clue` at all (every character is a box).
  - A separator in the answer must be written at the same position in the clue: for `heat of vaporization` the clue
    is `"____ __ v__________n"`.
  - Showing no letters is allowed and gives a harder question; showing most letters gives a hint.
- `variants`: other accepted spellings. A variant must have **the same length and the same separator positions** as
  the answer, and **must agree with every shown clue character**. Reason: the boxes are the same for everybody, so
  a variant that would need another number of boxes, or another letter at a shown position, cannot be typed.
  - `vaporization` / `vaporisation`: both 12 letters. OK, even with clue `"_a__________"`.
  - `color` / `colour`: different lengths. **Cannot both be accepted.** Choose a word without such variants, or give a clue that rules
    one out (for example the shown letters `"c_l_r"`, which fits only the American spelling and tells the students
    which one is expected).
- Grading is **all-or-nothing per question**: all blanks of the question right gives the full points, otherwise 0.
  So put several blanks in one question only when they belong together.
- Choose answers that have one obviously correct word. Avoid answers with many synonyms (the grader only knows your
  list), long phrases, symbols, and answers that need an accent or a Greek letter.
- A numerical answer is allowed if it is an integer you can type with digits (`answer: "100"`), but numbers with decimal
  points are not possible (the "." is not allowed). Ask for numbers in multiple choice instead.

```yaml
- type: fill
  points: 2
  text: |
    The energy to evaporate one mole of liquid is the molar [[1]].
  blanks:
    - answer: heat of vaporization
      variants: [heat of vaporisation]
      clue: "____ __ v__________n"
```

## 7. Open-ended questions

Students answer in plain typed text. Therefore an open question must ask for **an explanation in words only**:

- Good: "Explain why ...", "Describe what happens to ... and why", "Compare ... in words", "Give two reasons ...".
- Not allowed (the validator warns): calculations, derivations, equations, sketches, plots, or anything that needs pen,
  paper or a calculator. The warning words are: *calculate, compute, derive, derivation, show that, prove, solve,
  evaluate, work out, sketch, draw, plot*, and any question text with display maths (`$$`).
- Warnings do not stop the import, but they usually mean the question cannot be answered properly in the exam.
  Turn such a question into an explanation question ("Explain why the number of stages becomes infinite")
  or into a multiple-choice question that checks the result.
- Add a `model_answer` for yourself: the key points, in words, that earn the points.

## 8. Images

- **SVG preferred** (sharp at every size, small). Produce it with code, for example matplotlib:
  `plt.rcParams["svg.fonttype"] = "path"` (text becomes shapes, so no fonts are needed) and
  `fig.savefig("fig.svg", format="svg")`.
- PNG, JPEG or WebP are accepted as a fallback (screenshots, photos). At most **1 MB** per file.
- An SVG must not contain scripts, `<foreignObject>`, event handlers (`onclick=...`), `javascript:` or links to the
  outside (`href` only to `#...` or `data:image/`). Matplotlib output is fine.
- Always give `image_alt`: describe what the figure shows (axes, curves, key points), but not the answer.
- **Compute all plotted data with code.** Do not type approximate numbers or draw curves by hand. If a question
  refers to a number read from the figure, compute that number in the same script and check it.
- Keep figures readable on a phone: about 6 x 4 inches, font size 12 or more, no tiny legends.
- Reference the file by name only (`image: stages.svg`); the file must be in the zip.

## 9. Self-check before zipping

The AI should run the script `check_exam.py` (it is in the prompt below, and needs only Python and PyYAML). It checks:
the format and every key, ids, points, text; for `mc`: 2 to 8 options and exactly one correct; for `fill`: number of
`[[n]]` markers equal to the number of blanks and in order, allowed characters, variants with the same length and
separator positions, clue length and agreement with the answer **and** every variant; for `open`: the warning words;
images: file exists, extension, size at most 1 MB, `image_alt`, no scripts or external links in SVG; unused files.
It prints `ERROR` lines (fix them), `WARNING` lines, and `RESULT: OK` when there are no errors. The teacher app
runs an equivalent check on import, so the messages are similar.

Passing this script means the file has the right *form*. It does not check that the chemistry is right: the
AI must compute every number and check every option by calculation, and you should read the exam.

## 10. Packaging, importing and fixing errors

**Zip**: from the folder that holds the files, either
`zip -r exam.zip exam.yaml stages.svg` or, in Python,

```python
import zipfile
with zipfile.ZipFile("exam.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for name in ["exam.yaml", "stages.svg"]:   # list every image file
        z.write(name)
```

`exam.yaml` must be at the root of the zip, not in a sub-folder (a single top-level folder is tolerated).

**Import**: in the teacher app, *Import zip* and choose the file. Errors are listed with the question number and field,
for example `Question 3 (fill): blank 1 variant "vapourisation" has 13 characters but the answer has 12.`
Nothing is imported until there are no errors. Warnings are imported but listed; read them.

**If you get errors**: copy the whole message list and paste it back to the same AI conversation with "fix these errors
and send a new zip". Then import again (on an existing exam use *Replace from zip* in the **Edit** tab: settings and
results are kept).

**Small changes** (a typo, a score, a different correct option) are quicker in the **Edit** tab than going back to the AI.
*Export zip* gives you the exam as a zip again, which you can hand to the AI for larger revisions.

## 11. The prompt to paste into your AI tool

Copy everything between the markers (the "Copy prompt" button copies exactly this). Replace the line starting with
`>>> TEACHER:`. It is self-contained: the AI tool needs nothing else.

<!-- PROMPT START -->
You are helping a teacher write an exam for the exam system "seb_exams". Deliver a downloadable ZIP file
`exam.zip` that contains `exam.yaml` (at the root of the zip) and the image files it uses. Follow this specification exactly.

>>> TEACHER: describe the exam here. Topic, level/course, number of questions of each type (multiple choice, fill in the blank,
open explanation), points, duration in minutes, language. Paste lecture notes or sample questions below this line if you have them.

## Procedure
1. If anything essential is unclear (topic scope, level, number of questions), ask the teacher first, in one batch.
2. Write the questions. Compute every number, and check every multiple-choice option by calculation. Use code (you
   have a code tool) for calculations and for figures. Never type approximate numbers into a figure.
3. Write `exam.yaml` and the figure files.
4. Run the self-check script (below) on the zip. Fix every ERROR and read every WARNING. Repeat until it prints `RESULT: OK`.
5. Deliver `exam.zip` as a downloadable file. In your message, list the questions with their correct answers and tell the teacher what you verified by computation and what you did not.
   If you cannot create files, output `exam.yaml` in one code block and the figure code, and tell the teacher how to zip them.

## File format: `exam.yaml` (`format: seb-exam/1`)
Unknown keys are errors. YAML: spaces for indentation, no tabs. **Use a `|` block scalar for every text field
(title, intro, text, option text, image_alt, model_answer)** so LaTeX backslashes need no escaping. Quote numeric answers: `answer: "100"`.

```yaml
format: seb-exam/1              # required, exactly this
title: |                        # required
  Title of the exam
duration_minutes: 45            # required, whole number 1..600
intro: |                        # optional, markdown + maths
  Instructions or context.
questions:                      # required, 1..100 questions
  - id: rect-line               # optional, [a-z0-9-], 1..40 chars, unique; q1, q2, ... generated if missing
    type: mc                    # mc | fill | open
    points: 2                   # number > 0
    text: |                     # markdown; $inline$ and $$display$$ LaTeX (KaTeX); max 20000 chars
      Which equation follows? $$y = \dfrac{R}{R+1}x + \dfrac{x_D}{R+1}$$
    image: stages.svg           # optional; svg png jpg jpeg webp; <= 1 MB; at most 20 images per exam
    image_alt: |                # REQUIRED when image is given
      What the figure shows.
    shuffle_options: true       # mc only, default true
    options:                    # mc only: 2..8 options, exactly one with correct: true
      - text: |
          $y = \dfrac{R}{R+1}x + \dfrac{x_D}{R+1}$
        correct: true
      - text: |
          $y = \dfrac{1}{R+1}x + \dfrac{R\,x_D}{R+1}$
  - type: fill
    points: 3
    text: |
      CMO assumes equal molar heats of [[1]]. The mixture boils at [[2]] degrees Celsius.
    blanks:                     # one entry per marker [[1]], [[2]], ... in text, same order
      - answer: vaporization    # letters, digits, spaces, hyphens only; space/hyphen = fixed separator
        variants: [vaporisation] # optional; same length and same separator positions as answer
        clue: "_a__________"    # optional; same length as answer; "_" = box to fill, any other character is
                                # shown (must equal the answer's AND every variant's character there, any case);
                                # separators must be at the same positions; no clue = all boxes empty
      - answer: "100"
  - type: open
    points: 5
    text: |
      Explain in words why ...
    model_answer: |             # optional, teacher only
      Key points ...
```
Allowed keys: top level `format title duration_minutes intro questions`; every question `id type points text image image_alt`;
mc also `shuffle_options options` (option keys `text correct`); fill also `blanks` (keys `answer variants clue`);
open also `model_answer`.

## Rules
- **Maths**: `$...$` inline, `$$...$$` display, only KaTeX-supported LaTeX (`\frac \dfrac \sqrt \ln \log \cdot \times
  \alpha \Delta \mathrm{} \text{} \bar ^ _ ^\circ`, `aligned`/`cases`/`matrix`). No `\usepackage`, `\ce`, `\SI`, tikz,
  `\label`, custom macros. Chemical formulas as `$\mathrm{H_2O}$`. Do not use a literal dollar sign for money.
- **Multiple choice**: exactly one option with `correct: true`, unambiguously correct; every distractor
  unambiguously wrong (verify each by calculation; typical mistakes make good distractors); similar length and form;
  no "all/none of the above". Questions that give a starting equation and ask which derivation step follows are welcome.
- **Fill in the blank**: the student gets one box per character of the answer. `clue` decides which characters are
  shown: any positions, or none (`clue` omitted). Spelling `variants` must have the same length and the same
  space/hyphen positions as the answer and must agree with every shown clue character. `vaporization`/`vaporisation`
  is fine (both 12 letters). `color`/`colour` cannot both be accepted (different lengths): choose a word without such
  variants, or use a clue that rules one out. Multi-word answers use spaces or hyphens as separators and the clue
  repeats them at the same positions (`heat of vaporization` -> `"____ __ v__________n"`). Grading is all-or-nothing per
  question (all blanks right = full points, else 0), so only put blanks together that belong together. Answers must be
  typed with letters and digits only: no symbols, accents, Greek letters, units or decimal points. Choose answers with one clearly correct word.
- **Open questions**: students type plain text only. Ask for an explanation in words. Do NOT ask them to calculate,
  compute, derive, show that, prove, solve, evaluate, work out, sketch, draw or plot, do not use `$$`, and do not
  require equations, derivations, sketches or anything that needs pen, paper or a calculator.
  Give a `model_answer` with the key points in words.
- **Images**: SVG preferred. Generate with code, for example matplotlib with `plt.rcParams["svg.fonttype"] = "path"` and
  `fig.savefig("fig.svg", format="svg")`. PNG/JPEG/WebP only as a fallback. At most 1 MB each. No scripts,
  `<foreignObject>`, event handlers, `javascript:` or external links in SVG. Always give `image_alt` (describe what
  is shown, not the answer). Compute every plotted number with code. Readable on a phone (about 6 x 4 inch, font size 12+). Reference by file name only.
- Do not reveal the answer in the question text or `image_alt`. Reasonable points: mc 1-3, fill 1-3, open 3-6.
  Put multiple choice first, then fill, then open.

## Self-check script: save as `check_exam.py` and run `python3 check_exam.py exam.zip` (needs PyYAML)
```python
# check_exam.py - self-check for a seb-exam/1 zip.  Usage: python3 check_exam.py exam.zip
# Needs PyYAML (pip install pyyaml).  Prints ERRORS (must fix) and WARNINGS; exit code 1 if any error.
import re, sys, zipfile, yaml

TOP = {"format", "title", "duration_minutes", "intro", "questions"}
COMMON = {"id", "type", "points", "text", "image", "image_alt"}
EXTRA = {"mc": {"shuffle_options", "options"}, "fill": {"blanks"}, "open": {"model_answer"}}
WORDS = re.compile(r"\b(calculate|compute|derive|derivation|show that|prove|solve|evaluate|work out|sketch|draw|plot)\b", re.I)
EXTS = (".svg", ".png", ".jpg", ".jpeg", ".webp")
SEP = " -"

def check(path):
    E, W = [], []
    z = zipfile.ZipFile(path)
    names = [n for n in z.namelist() if not n.endswith("/")]
    ys = [n for n in names if n.split("/")[-1] == "exam.yaml" and n.count("/") <= 1]
    if len(ys) != 1:
        return ["The zip must contain exactly one exam.yaml (at the root or in one top-level folder)."], W
    pre = ys[0][:-len("exam.yaml")]
    try:
        d = yaml.safe_load(z.read(ys[0]).decode("utf-8"))
    except Exception as e:
        return [f"exam.yaml is not valid YAML: {e}"], W
    if not isinstance(d, dict):
        return ["exam.yaml must be a mapping with format, title, duration_minutes, questions."], W
    for k in d:
        if k not in TOP: E.append(f"Unknown top-level key '{k}'.")
    if d.get("format") != "seb-exam/1": E.append("format must be exactly: seb-exam/1")
    if not isinstance(d.get("title"), str) or not d["title"].strip(): E.append("title must be a non-empty text.")
    dm = d.get("duration_minutes")
    if isinstance(dm, bool) or not isinstance(dm, int) or not 1 <= dm <= 600:
        E.append("duration_minutes must be a whole number from 1 to 600.")
    if "intro" in d and not isinstance(d["intro"], str): E.append("intro must be text.")
    qs = d.get("questions")
    if not isinstance(qs, list) or not qs:
        return E + ["questions must be a non-empty list."], W
    if len(qs) > 100: E.append("At most 100 questions.")
    used, ids = set(), set()
    for n, q in enumerate(qs, 1):
        if not isinstance(q, dict):
            E.append(f"Question {n}: must be a mapping."); continue
        t = q.get("type")
        if t not in EXTRA:
            E.append(f"Question {n}: type must be mc, fill or open (got {t!r})."); continue
        P = f"Question {n} ({t}): "
        for k in q:
            if k not in COMMON | EXTRA[t]: E.append(P + f"unknown or misplaced key '{k}'.")
        qid = q.get("id")
        if qid is not None:
            if not isinstance(qid, str) or not re.fullmatch(r"[a-z0-9-]{1,40}", qid): E.append(P + "id must match [a-z0-9-], 1-40 characters.")
            elif qid in ids: E.append(P + f"duplicate id '{qid}'.")
            ids.add(qid)
        p = q.get("points")
        if isinstance(p, bool) or not isinstance(p, (int, float)) or p <= 0: E.append(P + "points must be a number > 0.")
        tx = q.get("text")
        if not isinstance(tx, str) or not tx.strip():
            E.append(P + "text must be non-empty text."); tx = ""
        if len(tx) > 20000: E.append(P + "text is longer than 20000 characters.")
        im = q.get("image")
        if im is not None:
            if not isinstance(im, str) or not re.fullmatch(r"[A-Za-z0-9._-]+", im) or not im.lower().endswith(EXTS):
                E.append(P + "image must be a plain file name ending in .svg .png .jpg .jpeg or .webp.")
            elif pre + im not in names: E.append(P + f"image file '{im}' is not in the zip.")
            else:
                used.add(im); raw = z.read(pre + im)
                if len(raw) > 1048576: E.append(P + f"image '{im}' is larger than 1 MB.")
                if im.lower().endswith(".svg"):
                    s = raw.decode("utf-8", "replace")
                    if re.search(r"<script|<foreignObject", s, re.I) or re.search(r"<[^>]*\son[a-z]+\s*=", s) or "javascript:" in s.lower():
                        E.append(P + f"SVG '{im}' contains script, foreignObject or event handlers.")
                    for h in re.findall(r"href\s*=\s*[\"']([^\"']*)[\"']", s):
                        if not (h.startswith("#") or h.startswith("data:image/")): E.append(P + f"SVG '{im}' links to '{h[:40]}' (external links are not allowed).")
            if not isinstance(q.get("image_alt"), str) or not q["image_alt"].strip(): E.append(P + "image_alt is required when image is given.")
        elif "image_alt" in q: W.append(P + "image_alt without image.")
        if t == "mc":
            o = q.get("options")
            if not isinstance(o, list) or not 2 <= len(o) <= 8: E.append(P + "options must be a list of 2 to 8 items.")
            else:
                c = 0
                for i, op in enumerate(o, 1):
                    if not isinstance(op, dict) or set(op) - {"text", "correct"} or not isinstance(op.get("text"), str) or not op["text"].strip():
                        E.append(P + f"option {i} needs 'text' (and optionally 'correct: true') and nothing else."); continue
                    if "correct" in op and not isinstance(op["correct"], bool): E.append(P + f"option {i}: correct must be true or false.")
                    c += op.get("correct") is True
                if c != 1: E.append(P + f"exactly one option must have correct: true (found {c}).")
                tl = [op.get("text", "").strip() for op in o if isinstance(op, dict)]
                if len(set(tl)) != len(tl): E.append(P + "two options have identical text.")
            if "shuffle_options" in q and not isinstance(q["shuffle_options"], bool): E.append(P + "shuffle_options must be true or false.")
        elif t == "fill":
            bl = q.get("blanks")
            marks = re.findall(r"\[\[(\d+)\]\]", tx)
            if not isinstance(bl, list) or not bl:
                E.append(P + "blanks must be a non-empty list."); continue
            if marks != [str(i) for i in range(1, len(marks) + 1)] or len(marks) != len(bl):
                E.append(P + f"text has markers {['[['+m+']]' for m in marks]} but {len(bl)} blanks; markers must be [[1]], [[2]], ... in order, one per blank.")
            for j, b in enumerate(bl, 1):
                B = P + f"blank {j} "
                if not isinstance(b, dict) or set(b) - {"answer", "variants", "clue"}: E.append(B + "may only have answer, variants, clue."); continue
                a = b.get("answer")
                if not isinstance(a, str) or not re.fullmatch(r"[A-Za-z0-9 -]+", a) or a != a.strip():
                    E.append(B + "answer must be text of letters/digits (spaces and hyphens allowed inside; quote numbers like \"100\")."); continue
                ws = [a]
                vs = b.get("variants", [])
                if not isinstance(vs, list): E.append(B + "variants must be a list."); vs = []
                for v in vs:
                    if not isinstance(v, str) or not re.fullmatch(r"[A-Za-z0-9 -]+", v): E.append(B + f"variant {v!r} must be letters/digits/space/hyphen text."); continue
                    if len(v) != len(a): E.append(B + f'variant "{v}" has {len(v)} characters but the answer has {len(a)}.'); continue
                    if any((x in SEP or y in SEP) and x != y for x, y in zip(a, v)): E.append(B + f'variant "{v}" has its spaces/hyphens in different places than the answer.'); continue
                    ws.append(v)
                if "clue" in b:
                    cl = b["clue"]
                    if not isinstance(cl, str) or len(cl) != len(a): E.append(B + f'clue must be text of exactly {len(a)} characters (the answer length).'); continue
                    if "_" not in cl: W.append(B + "clue shows every character, so there is nothing to type.")
                    for i, ch in enumerate(cl):
                        if a[i] in SEP:
                            if ch != a[i]: E.append(B + f'clue position {i+1} must be the separator "{a[i]}".')
                        elif ch in SEP: E.append(B + f"clue position {i+1} has a separator but the answer has a letter there.")
                        elif ch != "_":
                            for w in ws:
                                if w[i].lower() != ch.lower(): E.append(B + f'clue shows "{ch}" at position {i+1} but "{w}" has "{w[i]}" there.')
        else:  # open
            if WORDS.search(tx) or "$$" in tx:
                W.append(P + "asks for something that is not a plain-words explanation (calculate/derive/sketch/... or display math). Students can only type text.")
    for nme in names:
        if nme != ys[0] and nme.startswith(pre) and nme[len(pre):] not in used: W.append(f"File '{nme}' is not used by any question.")
    if len(used) > 20: E.append("At most 20 images.")
    return E, W

if __name__ == "__main__":
    e, w = check(sys.argv[1])
    for m in e: print("ERROR  ", m)
    for m in w: print("WARNING", m)
    print("RESULT:", "FAILED - fix the errors above" if e else "OK", f"({len(e)} errors, {len(w)} warnings)")
    sys.exit(1 if e else 0)
```

## Packaging
```python
import zipfile
with zipfile.ZipFile("exam.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for name in ["exam.yaml", "fig1.svg"]:   # exam.yaml first, then every image file
        z.write(name)
```
(or `zip -r exam.zip exam.yaml fig1.svg`). `exam.yaml` goes at the root of the zip. Then run the self-check on it.

After delivering, tell the teacher: import with "Import zip" in the teacher app; if it lists errors, paste them back to you and you will fix them and send a new zip.
<!-- PROMPT END -->
