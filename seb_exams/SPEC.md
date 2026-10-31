# seb_exams v2 — specification (the contract between the parts)

Everything about an exam (questions, answers, images, results) lives only in the Cloudflare D1 database and is
visible only to signed-in teachers of that exam. The repository and GitHub Pages hold code only.

## Parts and hosting

| Part | Where | Path in repo |
|---|---|---|
| API + teacher app | one Cloudflare Worker `seb-exams`, `https://seb-exams.carloscomail.workers.dev` (static assets for the teacher app) | `worker/src/`, `worker/public/` |
| Student exam page | GitHub Pages `https://chetools.github.io/claude/seb_exams/exam/?id=<exam-id>` (one shared page, no exam content) | `student/index.html`, `student/done.html` |
| Login email sender | Google Apps Script web app under the admin's Gmail | `apps-script/Code.gs` |
| AI authoring guide + example | served by the teacher app and in the repo | `docs/AI_EXAM_GUIDE.md`, `examples/` |

Constants: `WORKER_ORIGIN = https://seb-exams.carloscomail.workers.dev`, `STUDENT_PAGE = https://chetools.github.io/claude/seb_exams/exam/`,
`QUIT_URL = https://chetools.github.io/claude/seb_exams/exam/done.html`. D1 database `seb-exams`
(id `a99d3036-239c-411b-99e7-e39fa6851b33`), binding `DB`. Worker vars: `ALLOWED_ORIGINS` (student page origins:
`https://chetools.github.io,http://localhost:8765`), `APP_ORIGIN` (the Worker's own origin), `DEV` ("1" only in local
dev). Secrets: `MAIL_URL` (Apps Script /exec URL), `MAIL_SECRET`, `ADMIN_EMAIL` (initial admin; a secret so the
address is not in the public repo; in local dev it comes from `worker/.dev.vars`).

Client libraries (both pages load them from jsDelivr, exact versions): `katex@0.16.11` (css+js+auto-render not
used; call `katex.renderToString`), `markdown-it@14.1.0`, `fflate@0.8.2` (teacher app only, zip read/write),
`js-yaml@4.1.0` (teacher app only).

## Exam file format (`format: seb-exam/1`), what AI tools produce

A zip containing `exam.yaml` at the root (or in one top-level folder) and image files referenced by it.

```yaml
format: seb-exam/1
title: |
  McCabe–Thiele distillation
duration_minutes: 45            # 1..600
intro: |                        # optional, markdown + math
  ...
questions:
  - id: rect-line               # optional; [a-z0-9-]{1,40}; generated (q1, q2, ...) if missing; unique
    type: mc                    # mc | fill | open
    points: 2                   # number > 0
    text: |                     # markdown; $inline$ and $$display$$ LaTeX (KaTeX)
      ...
    image: stages.svg           # optional; file in the zip (svg, png, jpg, jpeg, webp); <= 1 MB
    image_alt: |                # required when image is given
      ...
    shuffle_options: true       # mc only, default true
    options:                    # mc only, 2..8 options, exactly one correct: true
      - text: |
          $y = \dfrac{R}{R+1}x + \dfrac{x_D}{R+1}$
        correct: true
      - text: |
          ...
  - type: fill
    points: 2
    text: |
      CMO assumes nearly equal molar heats of [[1]] for the two components.   # blanks [[1]], [[2]], ... in order
    blanks:                     # one entry per [[n]], same order
      - answer: vaporization    # letters/digits; spaces and hyphens allowed as fixed separators
        variants: [vaporisation] # optional; same length and same separator positions as answer
        clue: "_a__________"    # optional; same length; "_" = box to fill, any other char = shown (must equal the
                                 # char of answer AND every variant at that position, case-insensitive);
                                 # separators (space, hyphen) must appear at the same positions; omitted = all boxes empty
  - type: open
    points: 5
    text: |
      Explain ...
    model_answer: |             # optional, teacher-only
      ...
```

Validation (server is authoritative; the teacher app runs the same code client-side for instant feedback —
put it in `worker/public/shared/validate.js` as an ES module that the Worker also imports):
- Unknown keys are errors (catches AI typos). Messages name the question number and field, plain English,
  e.g. `Question 3 (fill): blank 1 variant "vapourisation" has 13 characters but the answer has 12.`
- Fill: number of `[[n]]` markers == number of blanks, numbered 1..N in order; answer chars `[A-Za-z0-9 -]`;
  grading is all-or-nothing per question (all blanks right → full points, else 0); comparison case-insensitive,
  per character, after trimming.
- Open: **warnings** (not errors) if text matches /\b(calculate|compute|derive|derivation|show that|prove|solve|
  evaluate|work out|sketch|draw|plot)\b/i or contains display math `$$`: "Open questions should ask for an explanation
  in words; students cannot type equations or attach drawings."
- Images: referenced files must exist in the zip; unreferenced files → warning. SVG is rejected if it contains
  `<script`, an event-handler attribute inside a tag (`/<[^>]*\son[a-z]+\s*=/i`; a bare `on[a-z]+=` would
  match `standalone=` in every matplotlib SVG header), `javascript:`, `<foreignObject`, or `href`/`xlink:href` to anything but `#…` or `data:image/`.
  Images are always shown with `<img src="data:...">`, never inlined.
- Limits: ≤ 100 questions, ≤ 20 images, text fields ≤ 20 000 chars.

The internal JSON form of an exam (stored in `exams.content_json`) is the normalized parsed YAML (ids filled in,
defaults applied, `format` kept). Images are referenced by file name; bytes live in table `images` keyed by
(exam_id, name).

`worker/public/shared/validate.js` (ES module, no dependencies, imported by the Worker and the browser) exports:
- `validateExam(obj, imageNames: string[]) -> {exam, errors: string[], warnings: string[]}` — `obj` is the object
  parsed from YAML (callers parse with js-yaml); `exam` is the normalized form (null when errors).
- `fillPattern(blank) -> string` — the clue, or the answer with every letter/digit replaced by `_`.
- `gradeSubmission(exam, answers) -> {detail: {qid: {ok, points}}, score, max}` (mc + fill; open excluded).
- `publicExam(exam, images: {name: dataUrl}) -> public_exam` (see Student API).
- `sanitizeSvgCheck(text) -> string|null` (error message or null).
- `sebJson(value) -> string` and `sebSettings(examId, quitPasswordSha256) -> object` (SEB section).

## Database (D1) — `worker/schema.sql`

```
teachers(email PK lowercase, name, is_admin INT, created_at, active INT)
login_tokens(token_hash PK, email, expires_at, used_at)          -- 15 min, single use
sessions(session_hash PK, email, expires_at, created_at)         -- 7 days
login_requests(email, at)                                        -- rate limit: 5 per email per hour
exams(id PK, owner_email, title, content_json, require_seb INT default 1, opens_at, closes_at,
      quit_password_sha256, extra_config_keys TEXT json, created_at, updated_at, regraded_at)
exam_teachers(exam_id, email, PRIMARY KEY(exam_id,email))         -- co-teachers (owner is implicit)
images(exam_id, name, mime, data_b64, size, PRIMARY KEY(exam_id, name))
attempts(exam_id, student_id, name, started_at, PRIMARY KEY(exam_id, student_id))
submissions(id INTEGER PK, exam_id, student_id, name, answers_json, detail_json, auto_score, auto_max,
      manual_json TEXT default '{}', receipt, started_at, submitted_at, late INT, seb_check, user_agent,
      UNIQUE(exam_id, student_id))
outbox(id INTEGER PK, to_email, subject, body, at)               -- only written when DEV == "1"
```
Times are ISO-8601 UTC strings. The old v1 tables are dropped (v1 data is test data only).

Exam ids: random, `[a-z]{2}-[a-z0-9]{6}` style, e.g. `mt-7k2p9x` (prefix from the title's first two letters).

## Authentication (teacher)

- `POST /auth/request {email}` → always `200 {ok:true}` with the same message. If the email is an active teacher and
  under the rate limit: create a token (32 random bytes, base64url; store SHA-256), and send an email with the link
  `APP_ORIGIN/auth/verify?token=…` via `POST MAIL_URL` JSON `{secret, to, subject, html, text}` (follow redirects).
  In DEV, write to `outbox` instead.
- `GET /auth/verify?token=…` → HTML page with a single "Sign in" button (POST form) so that mail scanners that
  pre-fetch links do not consume the token.
- `POST /auth/verify` (form field `token`) → if valid, unused, unexpired: mark used, create session, `Set-Cookie:
  sid=…; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`, `303 → /`. Otherwise an HTML error page with a
  link back to sign-in.
- `POST /auth/logout` → delete session, clear cookie.
- Teacher API requests (`/api/*`) require the session cookie AND header `X-Requested-With: seb-exams` (CSRF guard)
  and are same-origin only (no CORS headers on `/api/*`).
- First run: if `teachers` is empty, `ADMIN_EMAIL` is inserted as active admin.

## Teacher API (JSON; `401 {error}` when not signed in, `403` when not allowed)

Access rule: a teacher may see/edit an exam if owner or listed in `exam_teachers`; admins may see everything.

- `GET /api/me` → `{email, name, is_admin}`
- `GET /api/exams` → `[{id, title, owner_email, opens_at, closes_at, status: "draft"|"scheduled"|"open"|"closed",
  submissions, questions, updated_at}]` (status: draft = no opens_at; open = now within window)
- `POST /api/exams/import {yaml, images: {name: base64}, replace_id?}` → `200 {id, warnings}` | `422 {errors, warnings}`.
  `replace_id` replaces content of an existing exam (keeps settings, results; regrades).
- `GET /api/exams/:id` → `{id, title, content, images: [{name,mime,size}], owner_email, teachers,
  require_seb, opens_at, closes_at, has_quit_password, extra_config_keys, config_key, seb_link, student_url,
  submissions_count, regraded_at}`
- `GET /api/exams/:id/images/:name` → the image bytes (teacher only)
- `GET /api/exams/:id/export` → `{yaml, images: {name: base64}}` (client zips it with fflate)
- `PUT /api/exams/:id/content {content}` (the JSON form, from the editor) → validate, save, regrade → `{warnings}` | 422
- `PUT /api/exams/:id/settings {require_seb, opens_at, closes_at, quit_password?: string|null, extra_config_keys}`
  (`quit_password` plain text is hashed server-side; null clears; absent keeps)
- `POST /api/exams/:id/open-now` (opens_at = now, closes_at = now + duration + 15 min unless later) / `close-now`
- `POST /api/exams/:id/images {name, base64}` → `{name}` (replaces same name); `DELETE /api/exams/:id/images/:name`
- `DELETE /api/exams/:id`
- `POST /api/exams/:id/teachers {email}` (must be an existing teacher) / `DELETE /api/exams/:id/teachers/:email` (owner/admin)
- `GET /api/exams/:id/results` → `{questions (full, with answers), submissions: [{id, name, student_id, started_at,
  submitted_at, late, minutes_used, answers, detail, auto_score, auto_max, manual: {qid: {points, comment}},
  manual_max, total, receipt, seb_check}]}`
- `PUT /api/submissions/:id/manual {qid, points|null, comment}` (0 ≤ points ≤ question points, open questions only)
- `DELETE /api/submissions/:id` (also deletes the attempt row so the student could retake)
- Admin only: `GET /api/teachers`, `POST /api/teachers {email, name, is_admin}`, `PUT /api/teachers/:email {name,
  is_admin, active}`, `DELETE /api/teachers/:email` (cannot remove the last admin; exams of a removed teacher stay
  and are transferred to the admin doing the removal).
- `GET /exam.seb?id=…` is NOT teacher-only — see below.

Regrading: after any content change, recompute `detail_json/auto_score/auto_max` of every submission from its stored
answers; set `regraded_at`. Manual grades are kept for questions that still exist and are still `open`.

## Student API (public; CORS for `ALLOWED_ORIGINS`)

- `GET /s/info?id=…` → `{title, require_seb, duration_minutes, opens_at, closes_at, status, seb_link, seb_file_url}`
  (no questions). 404 for unknown ids.
- `GET /s/seb/<id>.seb` → the exam's unencrypted SEB config (`application/seb`), see "SEB".
- `POST /s/start {exam_id, name, student_id, seb}` → checks SEB, window (`open` only), that the student id has not
  submitted; creates the `attempts` row on first start (server `started_at`; a restart keeps the first time) →
  `200 {exam: public_exam, started_at, ends_at, server_now}` | `403/409/423 {error}` (423 = not open).
  `ends_at = min(started_at + duration, closes_at)`.
- `POST /s/submit {exam_id, student_id, answers, seb}` → requires an attempt; SEB check again; accepted until
  `ends_at + 2 min` grace (later → still stored with `late = 1`); one per id (409) → `{ok, receipt}`.
  Student ids are trimmed and upper-cased everywhere.

`public_exam = {id, title, intro, duration_minutes, questions: [{id, type, points, text, image (data URL),
image_alt, options: [{id, text}] (mc, shuffle flag), blanks: [{pattern}] (fill)}]}` — never answers. Fill `pattern`
is the clue string (or all `_` with separators kept when no clue). Option ids are `a, b, c…` in file order.

Answers format sent by the student page: `{qid: "optionid"}` (mc), `{qid: ["word1", "word2"]}` (fill, full strings
including shown clue letters and separators), `{qid: "text"}` (open, ≤ 20 000 chars).

## SEB

Per exam, the Worker generates an unencrypted plist (`application/seb`) with keys: `sebConfigPurpose 0`, `startURL =
STUDENT_PAGE + "?id=" + id`, `sendBrowserExamKey true`, `browserWindowWebView 3`, `URLFilterEnable true`,
`URLFilterEnableContentFilter false`, `URLFilterRules [{action 1, active true, expression
"^https://chetools\.github\.io/claude/seb_exams/exam/.*", regex true}]`, `allowQuit true`, `hashedQuitPassword`
(exam's or empty), `quitURL = QUIT_URL`, `quitURLConfirm true`. Config Key = hex SHA-256 of SEB-JSON (keys sorted
case-insensitively at every level, no whitespace, no escaping; port of `seb_json` in the v1 build.py — must produce
exactly the same string for the same dict). Accepted keys = [generated key] + extra_config_keys.
SEB check: `SHA256(seb.url + key) == seb.ck` with `seb.url` (fragment removed) exactly equal to the exam's student
URL `STUDENT_PAGE + "?id=" + id` (in DEV also `http://localhost:8765/exam/?id=` + id), or the
`X-SafeExamBrowser-ConfigKeyHash` header against the request URL. `seb_link = "sebs://" + WORKER host + "/s/seb/" + id + ".seb"`.

## Student page behaviour

`?id=` → `GET /s/info` → landing (title, duration, window, name + student ID form; outside SEB: "open in SEB" link +
.seb download, Start disabled) → `POST /s/start` → render (markdown-it + KaTeX client-side; per-student deterministic
shuffle of questions within sections mc/fill/open and of mc options when the flag is set) → timer from `ends_at`
corrected by `server_now` → autosave to localStorage (key `sebexam2:<id>:<student_id>`) → submit / auto-submit at
`ends_at` → "Submitted ✓" + receipt + quit link (`QUIT_URL`). Reload resumes (calls `/s/start` again, which returns
the same `started_at`).

Fill blanks: one box (`<input maxlength=1>`) per `_`, shown chars as fixed boxes, separators as gaps; typing advances,
Backspace on empty goes back, arrows move, paste spreads characters across boxes, letters/digits only, displayed
upper/lower as typed. Open: plain `<textarea>` with word count; no maths input.

## Teacher app (worker/public, served by the Worker, same origin as /api)

Sign-in page; dashboard (my exams + shared + all for admin, status, counts; buttons: Import zip, New blank exam,
"Write an exam with AI"); exam page with tabs:
1. **Questions** — read-only rendered view with answers marked (correct option, blank answers/variants/clue, model
   answers), images, warnings. This is the "easily viewable" view.
2. **Edit** — form editor (per-question cards: type, points, text with live preview, image upload/choose, options
   with correct radio, blanks with answer/variants/clue + live box preview, model answer; add/delete/reorder
   questions) and "Replace from zip"; Save → `PUT content`.
3. **Settings** — opens/closes (local time inputs), open now/close now, require SEB, quit password, extra Config
   Keys, student link + `sebs://` link + .seb download + Config Key, co-teachers.
4. **Results** — table, open-answer grading (points + comment per answer), totals, CSV, delete submission.
Also: "Export zip" (exam.yaml + images, round-trips through import), Admin page (teachers). "Write an exam with
AI" page: shows `docs/AI_EXAM_GUIDE.md` rendered, a "Copy prompt" button, and a download of the example zip.
Works at 390 px and 2560 px (header aligned with body column; tables scroll inside their box).

## Tests

- `tests/test_validate.mjs` (node): validator unit tests incl. planted defects.
- `tests/e2e_v2.cjs` (Playwright, local `wrangler dev --local --port 8787` with DEV=1 + `python -m http.server 8765`
  serving `student/` as `/exam/`): teacher login via outbox link, import example zip, view, edit, settings, open
  now; student flows (outside SEB, wrong key, full exam, reload, duplicate, timeout); grading; CSV; export→import
  round trip; admin adds a teacher; access control (teacher B cannot see A's exam); layout at 390/2560.

## v2.1 additions (grading UI, submissions viewer, import preview, fixed bar)

### Import preview and approval (backend + teacher app)
- `POST /api/exams/import` accepts `dry_run: true`: validates exactly as a real import and stores nothing.
  It returns `200 {ok: true, exam (normalized content), warnings, summary}` or `422 {errors, warnings}`.
  With `replace_id`, `summary = {added: [qid], removed: [qid], changed: [qid], key_changed: [qid], regrade_count,
  manual_grades_dropped}`. Here `key_changed` means a correct option, a blank answer/variants, or the points
  changed; `regrade_count` = number of stored submissions; `manual_grades_dropped` = number of manual grades on
  removed questions or questions that are no longer `open`. Without `replace_id`, `summary` is null.
- Replacing (dry run or real) is refused with `423 {error}` while the exam's status is `open`.
- The teacher app never saves an uploaded zip directly:
  1. read the zip;
  2. dry-run it;
  3. render a preview identical to the Questions tab, with a "Preview – not saved" banner, the errors and warnings,
     and, when replacing, the change summary;
  4. the fixed bar shows **Approve and save** (or **Approve and replace**), disabled while there are errors,
     **Cancel** and **Choose another zip**.

  Approve sends the real import. Leaving the page with an unapproved preview asks for confirmation
  (`beforeunload` + in-app navigation). Any teacher of the exam may approve.
- Questions are matched by `id` on replace. Settings, co-teachers and submissions are kept. Manual grades are kept
  for questions that still exist and are still `open`.

### Fixed bar (teacher app)
- Every exam page has one sticky bar at the top that never scrolls out of view. It holds:
  - the exam title and status badge;
  - the tabs: Questions, Edit, Grade, Submissions, Settings, Results;
  - the actions: **Replace from zip**, **Export zip**. Preview mode swaps them for Approve/Cancel/Choose another
    zip. On the Edit tab, **Save** and **Discard** appear while there are unsaved changes.
- The dashboard has the same kind of bar, with **Import zip** and **New blank exam**.
- On phones (< 768 px) the bar is compact: short labels, the tabs scroll horizontally inside the bar, and no
  action is hidden in a menu.
- The "Replace from zip" button in the Edit tab moves to the bar.

### Grade tab (`#/exam/<id>/grade`, `worker/public/js/grade.js`)
- Open questions only, using `GET /api/exams/:id/results` and `PUT /api/submissions/:id/manual {qid, points,
  comment}`.
- Points are a multiple of 0.5, from 0 to the question's points (the server rejects other values with 422).
- No model answer is shown. No grader is recorded; the last write wins.
- Anonymous by default: a "Show names" toggle; otherwise students are labelled "Student 1…N". The numbering
  follows the shuffled order, so the labels are stable.
- Answer order: a fixed shuffle seeded by the exam id, the same on every visit and for every teacher.
- Filter "Ungraded only" is on by default; progress "14 of 30 graded" is shown per question.
- **Desktop (≥ 768 px):**
  - grouped by question (default) or by student (toggle);
  - every answer shown in full;
  - beside each answer, a number input (step 0.5) and an optional comment;
  - Enter saves and focuses the next grade input.
- **Phone (< 768 px):**
  - one card at a time (one student's answer to one question);
  - a slider (step 0.5, 0..max) shows its value large and saves on release;
  - swipe left/right, plus ‹ › buttons, moves to the next/previous card;
  - the order is next student for the same question, then the next question; a toggle switches to next question
    for the same student;
  - a question picker sits at the top;
  - dragging the slider never triggers a swipe;
  - optional comment field.
- Saving shows "Saved ✓". On a network failure the grade is kept in localStorage
  (`sebgrade:<examid>:queue`) and retried until it succeeds; a pending badge shows unsaved grades.
- Filtered-out (already graded) cards are not removed from view the moment they are graded. The list is
  re-filtered only when the filter is toggled or the page is reloaded, so the card does not jump away.

### Submissions tab (`#/exam/<id>/submissions`, `worker/public/js/submissions.js`)
- A list of submissions with checkboxes, "Select all", **View selected**, **View all**, and a per-row **View**.
- Each submission is shown "as entered":
  - a header with name, ID, start/submit time, late flag, receipt, SEB check and total;
  - every question with its text and figure;
  - the chosen option (all options listed, the chosen one marked);
  - fill boxes showing exactly what was typed (clue letters distinct, empty boxes empty);
  - essay text with line breaks kept.
- Toggles:
  - **Order**: exam-file order (default) or "as the student saw it". The latter must reproduce the student page's
    deterministic shuffle exactly: same seed, same RNG, same section grouping and option shuffling. Copy the
    algorithm from `student/index.html` into `worker/public/shared/shuffle.js` and prove equality in a test.
  - **Show marking** (default on): correct/wrong per mc/fill, points, essay grade and comment.
  - **Anonymise** (default off): replaces name/ID/receipt with "Student N".
- Export:
  - **Print / Save as PDF**: a print stylesheet with one student per page, triggering `window.print()`;
  - **Download zip**: one self-contained HTML file per student (inline CSS, KaTeX CSS link, images as data URLs,
    rendered math), file names `<student-id>.html` or `student-N.html` when anonymised.
