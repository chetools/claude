# seb_exams: Safe Exam Browser exams with a teacher app and a Cloudflare database

- **Teacher app:** <https://seb-exams.carloscomail.workers.dev/>. Teachers sign in with an emailed link; there are no passwords.
- **Student page:** `https://chetools.github.io/claude/seb_exams/exam/?id=<exam-id>`. Students open it through the
  exam's `sebs://` link, which starts Safe Exam Browser (SEB).

## Where things are stored

Questions, answers, images and results exist only in the Cloudflare D1 database `seb-exams`. Only signed-in
teachers of an exam can see them: its owner, the co-teachers the owner adds, and admins.

The repository and GitHub Pages hold code only. The student page receives the questions only after:
- the SEB check passes;
- the exam is open (between its opening and closing times).

The `examples/` exam is deliberately public; it shows teachers and AI tools the format.

## Making an exam

1. In the teacher app, open **Write an exam with AI** and press **Copy prompt**.
2. Paste the prompt into ChatGPT, Claude or another AI tool, together with a description of the exam you want.
3. The AI tool writes `exam.yaml` and SVG figures, checks them with the script included in the prompt, and gives
   you a zip file.
4. **Import zip** in the teacher app. Any errors are listed with a **Copy errors** button; paste them back to the
   AI tool to get a fixed zip.
5. Read the exam with its answers on the **Questions** tab, and change it on the **Edit** tab if needed. Changing
   an answer key re-grades the submissions already received.
6. **Settings:** set opening and closing times (or press **Open now**). Then give students the `sebs://` link or
   the `.seb` file.
7. **Results:** automatic marks for multiple-choice and fill-in-the-blank questions, a points box and comment for
   each open answer, and a CSV download.

The format and rules are in `docs/AI_EXAM_GUIDE.md`. In short:
- Fill-in-the-blank answers are typed one character per box. The exam decides which letters, if any, are shown
  as clues. Accepted spelling variants must fit the same boxes.
- A fill-in-the-blank question gives full points or zero.
- Open questions ask for explanations in words only.

## Layout

```
worker/src/          the Worker: sign-in (auth.js), teacher API (teacher.js), student API (student.js), SEB (seb.js)
worker/public/       teacher app (bundled into the Worker by tools/bundle_public.mjs)
worker/public/shared/validate.js   exam validation and grading, used by the Worker and the browser
worker/schema.sql    database schema
student/             the student exam page (published to gh-pages:seb_exams/exam/)
apps-script/Code.gs  sends the sign-in emails from the admin's Gmail
docs/                SETUP.md (email sender setup), AI_EXAM_GUIDE.md
examples/            public example exam and its zip
python/mccabe.py     McCabe–Thiele stepping used to draw and check the example figure
private/             gitignored: real exams with answers
tests/               test_validate.mjs, api_smoke.sh, e2e_v2.cjs, ui_mock.cjs, student_mock.cjs, test_mccabe.py
SPEC.md              the full specification
```

## Deploying

The node tools (wrangler) go in `.buildtools/`; the Worker's own dependencies are installed with `npm install` in
`worker/`.

```bash
node tools/bundle_public.mjs
```

Then run this in `worker/`:

```bash
npx wrangler deploy
```

To apply the database schema, also in `worker/` (it drops and recreates the tables):

```bash
npx wrangler d1 execute seb-exams --remote --file schema.sql
```

Run that only for a new database.

To publish the student page, copy `student/index.html` and `student/done.html` to `gh-pages:seb_exams/exam/`.

Worker secrets are `MAIL_URL` and `MAIL_SECRET` (see `docs/SETUP.md`). `ADMIN_EMAIL` is only needed for an empty
database.

## Tests

```bash
node --test tests/test_validate.mjs
```

```bash
bash tests/api_smoke.sh
```

```bash
node tests/e2e_v2.cjs
```

`e2e_v2.cjs` runs the whole system locally in a browser, with SEB simulated through its JavaScript API. Pass an
exam zip as the second argument to test with that exam instead of the example.

## Limits of the protection

- **The Config Key can be forged.** The SEB check compares the Config Key of the exam's generated `.seb` file. Anyone
  holding that unencrypted file can compute the key and send it from an ordinary browser, with some effort.
- **An encrypted `.seb` is stronger.** Make one with the SEB Config Tool, paste its Config Key into the exam's
  Settings, and give students that file instead.
- **None of this replaces a proctor.**
- **The answer keys of the old v1 example** (McCabe–Thiele) are still in the git history from before v2.

## Cloudflare free plan

Quoted from the Cloudflare docs on 2026-10-29:
- Workers Free: "100,000 requests/day".
- D1 Free: "Rows written: 100,000 / day", "Maximum database size: 500 MB".

A class sitting an exam uses a few requests and rows per student.
