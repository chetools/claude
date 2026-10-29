# seb_exams: Safe Exam Browser exams on GitHub Pages with a Cloudflare database

- Student page: `https://chetools.github.io/claude/seb_exams/<exam-id>/`. It opens only in Safe Exam Browser (SEB).
- Teacher results: `https://chetools.github.io/claude/seb_exams/results/`. Needs the teacher password.
- API: Cloudflare Worker `seb-exams` (`https://seb-exams.carloscomail.workers.dev`) with the D1 database `seb-exams`.

```
exams/<id>/exam.yaml     questions + answer key (public example exams)
exams/<id>/figures.py    optional; draws figures into the directory given as argv[1]
private/<id>/exam.yaml   real exams: gitignored, so their answers never reach the public repo
build.py                 exam.yaml -> dist/<id>/{index.html, done.html, <id>.seb, key.json}
deploy.py                schema + answer keys -> D1, Worker code -> Cloudflare
worker/                  the API (submit, SEB check, grading, results)
web/                     page templates, exam.js, results.js, style.css
tests/                   test_mccabe.py (numbers in the example), e2e.cjs (browser + Worker + D1)
```

## How it works

1. The student opens the `sebs://…/<id>.seb` link (or the downloaded `.seb` file). SEB starts locked down on the exam page.
2. The student enters their name and ID. The page asks the Worker (`/check`) whether this SEB configuration is
   accepted before the timer starts.
3. Answers are autosaved in the browser every few seconds. After a reload or an SEB restart the exam resumes with
   the same timer.
4. On Submit, or automatically when the time is up, the page sends everything to `/submit`. The Worker then:
   - checks the SEB Config Key again;
   - refuses a second submission for the same student ID (IDs are compared in upper case);
   - grades the multiple-choice and fill-in-the-blank questions against the key held in D1;
   - stores the submission.
5. The student sees only "Submitted ✓" and a receipt code, then the "Finish and quit" link (SEB's `quitURL`).
6. The teacher signs in on the results page. It shows one row per student (automatic score, every answer, open
   answers in full) and has a CSV download.

The public page contains no answers; `build.py` fails if any answer text or answer field would reach it.

Fill-in-the-blank grading ignores case, spacing and punctuation, but not spelling. List every accepted form,
for example `[vaporization, vaporisation]`. The hint shows the second letter of the word, so all accepted answers
must share that letter (the build checks this).

## Writing a new exam

Copy `exams/mccabe-thiele/exam.yaml` to `private/<new-id>/exam.yaml`; the directory name is the exam id. Then:

- **Questions.** Use `type: mc` (exactly one option `correct: true`), `type: fill` (one `[blank]` in the text,
  `answers: [...]`) or `type: open` (with an optional `model_answer`, shown only to the teacher). Each question
  needs `points`.
- **Text.** Write Markdown, with `$…$` and `$$…$$` for maths. Inside YAML double quotes, write `\\` for one backslash.
- **Order.** Questions are shuffled per student within each section (multiple choice, fill in the blank, open).
  Options are shuffled too, unless the question sets `shuffle: false`.
- **Exam settings.** `duration_minutes`, `require_seb`, `seb.quit_password_sha256`, `seb.extra_config_keys`.

```bash
python build.py private/<new-id>
```

```bash
python deploy.py --keys
```

Then publish `dist/<new-id>/` (without `key.json`) to `gh-pages:seb_exams/<new-id>/`.
Run `python build.py` (all exams) before publishing, so `dist/index.html` lists the new exam.

`deploy.py` needs `npm i katex wrangler` in `.buildtools/` and Cloudflare credentials in the environment
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).

## Safe Exam Browser settings

`build.py` writes an unencrypted `.seb` with these settings:
- start page: the exam;
- URL filter: only pages under the exam's URL;
- quit password: the proctor's, stored as a SHA-256 hash (`seb.quit_password_sha256`);
- quit link: `done.html`;
- `browserWindowWebView = 3`, "Prefer Modern", so the SEB JavaScript API is available;
- Config Key also sent in headers, for older SEB versions.

The build computes the file's **Config Key** with the published algorithm
(<https://safeexambrowser.org/developer/seb-config-key.html>) and stores it in D1.

How the Worker checks a submission:
- It accepts a submission only if `SHA256(page URL + Config Key)` matches either:
  - the value SEB exposes to the page (`SafeExamBrowser.security.configKey`), or
  - SEB's `X-SafeExamBrowser-ConfigKeyHash` header.
- This needs SEB 3.3.2+ on Windows, or 3.0+ on macOS/iOS, for the JavaScript API (per the SEB page above).

To change the quit password:

```bash
python -c "import hashlib,getpass;print(hashlib.sha256(getpass.getpass().encode()).hexdigest())"
```

Put the output in `seb.quit_password_sha256`, then rebuild, redeploy the keys and republish. The Config Key changes with it.

**Using an encrypted `.seb` made with the SEB Config Tool:**
1. Copy its Config Key (Exam pane) into `seb.extra_config_keys`.
2. Rebuild and run `python deploy.py --keys`.
3. Give students that file instead.

**What this protects and what it does not.**
- The check stops students from submitting from an ordinary browser by accident or casually.
- The Config Key is a hash of the settings. Anyone holding the **unencrypted** `.seb` file can compute it and forge
  the check from an ordinary browser with some effort.
- For real exams, use an encrypted `.seb` from the SEB Config Tool (see above) and do not publish the plain file.
- None of this replaces a proctor.

## Passwords

- **Teacher password:** a Worker secret. To change it, run this in `worker/`:

  ```bash
  npx wrangler secret put TEACHER_PASSWORD
  ```

- **Proctor quit password:** only its hash is in `exam.yaml`. It was handed over in the chat, not stored in the repository.

## Cloudflare free plan

Quoted from the Cloudflare docs on 2026-10-29:
- Workers Free: "100,000 requests/day", "CPU time 10 ms" per request.
- D1 Free: "Rows written: 100,000 / day", "Rows read: 5 million / day", "Maximum database size: 500 MB".

One exam submission is one Worker request and one row written. Two requests per student (check + submit) is far
below these limits for any class.

## Tests

```bash
python -m pytest -q tests
```

The end-to-end test runs against a local Worker; setup steps are in the header of `tests/e2e.cjs`:

```bash
node tests/e2e.cjs
```

It covers:
- the page outside SEB;
- a wrong SEB configuration;
- a full exam with a reload;
- a duplicate student ID;
- the automatic submission at time-out;
- results and CSV;
- layout at 390 px and 2560 px.
