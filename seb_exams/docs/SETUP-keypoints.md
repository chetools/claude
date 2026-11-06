# Keypoints assignments — setup and use

This adds keypoints assignments to the existing seb_exams system. A keypoints assignment is an explain-the-page assignment: the teacher's typeset page is the assignment material, the teacher's own model take sets the standard, and students record a single spoken explanation of the page, re-recording against per-point feedback with the best attempt's grade standing.

The server holds custody only. It stores the assignment page, the sealed audio, the approved answer key and the grades; it never transcribes and it makes no model calls of any kind. All transcription and judgement happen in the teacher's and the students' own Muse apps, through the skills named below, running local Parakeet transcription on their own machines.

Only the new steps are given here; the base install is `docs/SETUP.md` and must already be working (Worker deployed, D1 database `seb-exams`, teacher sign-in by emailed link through the Apps Script sender).

Nothing assignment-specific is hard-coded in the Worker. Each exam's title, student app address and times are stored in the database and edited in the teacher app; the assignment page and the answer key are stored per exam.

## 1. Files

Copy into the repository, in place:

- `worker/src/transcript.js` — student sign-in, sealing, teacher API (`/t/*`, `/api/t/*`), watch tokens and the watch routes (`/w/*`).
- `worker/src/keypoints.js` — new: the keypoints routes (`/k/*`): assignment page upload and fetch, model-take handling, answer-key upload, per-attempt grading records and the standing grade.
- `worker/src/index.js` — routes `/t/`, `/api/t/`, `/k/` and `/w/` to their handlers.
- `worker/schema-transcript.sql` — the shared tables the keypoints flow reuses for sign-in, roster, sessions and submissions (`t_exams`, `t_exam_teachers`, `t_roster`, `t_login_tokens`, `t_student_sessions`, `t_login_requests`, `t_submissions`, `t_settings`).
- `worker/schema-keypoints.sql` — new: the roster `role` column and the `k_pages` / `k_keys` tables.
- `worker/schema-watch.sql` — new: the watch-token table (`t_watch_tokens`) and the pending-take claim column on `t_submissions`.
- `worker/public/js/transcript.js` — teacher-app module (list, and the Exam / Roster / Results / Muse tokens tabs), in the same shell and style as the rest of the teacher app.
- `worker/public/js/app.js` — a "Transcript exams" link in the top navigation and the `#/texams` and `#/texam/<id>/<tab>` routes.
- `tests/` — local tests (optional in the repo; not deployed).

## 2. Database

Apply the migrations to the live database in this order, from `worker/`. Each is a one-time migration; the plain `ALTER TABLE` steps fail on a second run with duplicate-column errors, which is how you know they have already been applied.

```
npx wrangler d1 execute seb-exams --remote --file schema-transcript.sql
npx wrangler d1 execute seb-exams --remote --file schema-audio.sql
npx wrangler d1 execute seb-exams --remote --file schema-practice.sql
npx wrangler d1 execute seb-exams --remote --file schema-keypoints.sql
npx wrangler d1 execute seb-exams --remote --file schema-watch.sql
```

- `schema-transcript.sql` is additive and safe to re-run; it drops nothing. On a fresh database it already creates the audio columns, so `schema-audio.sql` is then unnecessary.
- `schema-practice.sql` adds the exam's audit-token hash column (used by the teacher skill, section 6) and the attempts table that carries each grading upload.
- `schema-keypoints.sql` adds the roster `role` column (`student` | `model`) and the `k_pages` / `k_keys` tables.
- `schema-watch.sql` creates `t_watch_tokens` and adds the `watch_claim_at` column to `t_submissions`.

## 3. Secrets

From `worker/`:

```
npx wrangler secret put SEAL_SECRET
```

- `SEAL_SECRET` seals takes (a keyed code over each sealed record) and derives the encryption key for stored watch tokens. Use a long random value, for example the output of `openssl rand -hex 32`. Sealing fails closed without it. Changing it later invalidates the receipts of earlier seals (the sealed records themselves stay readable in results) and makes every stored watch token unreadable — the recovery is to regenerate each student's watch credentials and email them again (section 7).

`MAIL_URL`, `MAIL_SECRET` and `ADMIN_EMAIL` are unchanged: student sign-in links and watch setup emails are sent by the same Apps Script sender as teacher links. There is no model key and no other server secret for this system: the server makes no model calls.

## 4. Worker variables

In `worker/wrangler.toml`, check `[vars]`:

- `APP_ORIGIN` is the Worker's own public origin. It is already set for teacher sign-in; student login links carry it to the recording app as the server address.
- `ALLOWED_ORIGINS` must include the origin that serves the student recording app (for example `https://chetools.github.io`), or the app cannot call the sealing endpoints.

## 5. Deploy

From the repository root, then `worker/`:

```
node tools/bundle_public.mjs
cd worker
npx wrangler deploy
```

## 6. Audio takes: set up the R2 bucket

A spoken take is sealed from its audio: the recording app uploads one audio file for the take, the Worker stores it in a Cloudflare R2 bucket and seals a fingerprint of the audio. The server never transcribes: all transcription is done in the student's or the teacher's Muse. This needs a one-time R2 setup on the Cloudflare account that holds the Worker.

1. **Open R2.** Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) with the account that holds the seb-exams Worker. In the left sidebar choose **Storage & databases → R2 Object Storage → Overview**.
2. **Add the R2 subscription (first time only).** If the page offers **Add R2 subscription to my account** (or a checkout button), complete it. Cloudflare requires a payment method on file to enable R2, even for free use; if asked, add one under **Manage Account → Billing → Payment**. The amount due is $0: the subscription includes, each month, 10 GB-month of Standard storage, 1 million write operations and 10 million read operations free, and downloads (egress) are free. A class's audio — a few megabytes per student, deleted under step 5 — stays far inside that allowance.
3. **Create the bucket.** On the R2 Overview page choose **Create bucket**. Name it exactly `seb-exams-audio` (the name must match `worker/wrangler.toml`; a mismatch makes every audio upload fail). Leave location on **Automatic** and storage class on **Standard** — do not choose Infrequent Access, which has no free tier and charges for a 30-day minimum even if files are deleted sooner. Choose **Create bucket**.
4. **Keep the bucket private.** Do not enable public access, an `r2.dev` subdomain, or a custom domain on this bucket. Nothing needs them: the Worker reads and writes the bucket through its binding, and teachers listen through the results view. Student audio must not be publicly reachable.
5. **Set the retention rule.** Open the bucket → **Settings → Object lifecycle rules → Add rule**. Name it `delete exam audio`; set the prefix to `exams/` (every audio file's name starts with that prefix); set the action to **Delete objects** after **30 days** (or the period you have told students; keep it long enough for grading disputes to be settled); enable the rule and save. Deleting an exam in the teacher app deletes its audio immediately; this rule is the backstop for everything else. Note the cost arithmetic: storage is charged per GB-month pro-rated by the day, and deletes are free, so audio held for days costs effectively nothing at class scale.
6. **Connect the bucket to the Worker.** In `worker/wrangler.toml`, the `[[r2_buckets]]` block (binding `AUDIO`, bucket `seb-exams-audio`) must be present. The bucket must exist before the deploy in section 5, or the deploy fails.
7. **No server transcription — nothing to set.** Sealed audio takes are held as `audio_sealed` until the student's Muse downloads the audio, transcribes it, and uploads its corrected transcript with its feedback and per-point grades. A take remaining `audio_sealed` is the normal state before grading, not an error.
8. **Test.** Run one signed-in test take (section 8). The end screen shows the audio fingerprint; in the results view the submission shows its sealed audio with a player. If an audio upload fails with a 500 error, the binding or bucket name is wrong (steps 3 and 6).

## 7. Recording app

Publish the keypoints recording app as the assignment app page, and set each keypoints exam's app address to it. The published app is at `https://chetools.github.io/muse/keypoints-app/`; its sources live in `~/workspace/keypoints-app/recording-app/` (`app-v29-keypoints.html` is the current build). A new exam in the teacher app is prefilled with that address. The app alone, without sign-in, shows no assignment: the assignment page is fetched from the server after sign-in.

Students sign in inside the app with their school email: the server emails a one-time sign-in link (valid 15 minutes, single use, at most 5 per address per hour; a student sign-in lasts 12 hours, covering the take and the grading that follows). Only rostered students can sign in.

## 8. Creating a keypoints assignment

1. **Create the exam shell.** Open the teacher app and choose "Transcript exams" in the top navigation (directly: `https://<worker-origin>/index.html#/texams`), signed in with the emailed link, as usual. Create a new exam, set its title and its opening and closing times — a take can only start while the exam is open — and paste the roster on the Roster tab, one student per line as `Name, email`. Save.
2. **Generate the audit token.** On the exam's Exam tab, generate the exam's audit token. It is shown once and only its hash is stored; generating a new one replaces the old. The teacher skill (step 3) reads the token from the environment; it is never printed or stored in the exam record.
3. **Build the page and the key with the teacher skill.** Give your Muse the `local-keypoints-teacher` skill (published as `keypoints-teacher-skill` in chetools/muse), the course server address, the exam ID, and the audit token in its environment. The skill turns your photographs of the handwritten page into the typeset student page (LaTeX source plus an HTML fragment containing only what the photographs contain) and uploads it; it enrols your address as the model-take identity; you then record a model take in the recording app, going through the page as a student would. The skill fetches that sealed take, transcribes it locally with Parakeet, corrects the transcript for chemical-engineering terms with its bundled glossary, and drafts the answer key — key points and connections — for you to correct and weight in one session. Uploading the approved key projects it onto the exam's rubric and opens the assignment.
4. **Students record and are graded.** Each student opens the app link, signs in, reads the typeset page, and records one spoken explanation; they may move between pages while recording. The audio seals on the server. The student's own Muse then grades the take with the `local-keypoints-grading` skill (published as `keypoints-grading-skill` in chetools/muse): given the course server address, the assignment, and the sealed session code printed in the student's app summary, it downloads the sealed audio, transcribes it locally with Parakeet, corrects the transcript with the bundled glossary, scores each key point full, half, or zero, and uploads the corrected transcript, the feedback, and the per-point grades. Only the corrected transcript is kept; the raw transcript is not retained. The answer key reaches the student's Muse only after the take is sealed and is never shown to the student; feedback states what the explanation lacked against each point, without quoting the key.
5. **Attempts and the standing grade.** Grading is formative: every upload is an attempt, the student is told what is missing, and they may re-record without limit for an increasing grade. The standing grade is the best attempt's, served by `/k/standing` and shown in the Results tab. Deleting an exam deletes its page, key, roster, submissions and audio with it.

## 9. Watch grading (Muse tokens)

Watch grading removes the per-take paste from the student's flow: instead of copying the end-screen block into their Muse after every take, the student sets up once, and their Muse polls the course server for their sealed takes and grades each one as it appears — transcribing and grading exactly as the student skill in section 8 already does, only without the paste. Students who never set up the watch keep using the paste block unchanged.

1. **How the tokens work.** Each student has one credential pair per exam: a grading token (full watch rights for that student's own takes in that exam) and a poll key (low privilege — it can only ask whether a take is pending). Both are stored encrypted at rest (AES-GCM, with the key derived from the existing `SEAL_SECRET`; authentication is by a stored SHA-256 hash, and a stored value is decrypted only at the moment it is emailed). Rotating `SEAL_SECRET` therefore makes every stored watch token unreadable: the email action then fails for that student with a "regenerate it" error, and the fix is to regenerate their credentials from the Muse tokens tab (step 2) and email them again. The teacher app never displays token material — the list returns metadata only — and email is the only way a token leaves the server, one message addressed to one student, containing only that student's credentials.
2. **Manage tokens in the teacher app**, on the exam's **Muse tokens** tab. Paste addresses into the add box (one per line, or `Name, email`): an address with no token gets one generated, an address that already has one is left unchanged. Each row shows the student's status with its created, last-emailed, last-polled and last-pending stamps — the last-polled stamp is how you can see whose setup is actually running. Per row: **Regenerate** replaces both credentials (the old ones stop working at once, and the student must set up again with the new ones, so email them afterwards), **Email** sends or re-sends that student's setup email, and **Delete** removes the row and revokes both credentials at once. The **Email checked** and **Email all** buttons send the setup email to the ticked rows or to every student on the tab, first generating credentials for anyone who lacks them; every message is sent individually through the same Apps Script sender as the sign-in links.
3. **The student side.** The setup email carries the server address, the student's grading token and poll key, and one instruction block to paste into their Muse, once: it points Muse at the `local-watch-grading` skill (published as `watch-grading-skill` in chetools/muse), which stores the credentials, polls every 60 seconds with the poll key, and — when a take is pending — grades it with the `local-keypoints-grading` skill and uploads the grades. The token and poll key are never printed back to the student. A student who does not want to wait for the next poll can open their Muse after sealing a take and say "check now": Muse runs the same pending check at once and grades whatever it finds.
4. **The two watch routes** are `GET /w/poll` (credential: the poll key, in the `X-Poll-Key` header; answers `{"pending": n}` and stamps the row's last-polled time, and its last-pending time when n is greater than zero) and `GET /w/pending` (credential: the grading token, in the `X-Watch-Token` header; lists that student's takes whose status is `sealed` or `audio_sealed`, each with its session code). Fetching the pending list claims each listed take for 15 minutes (`watch_claim_at` on the submission): a claimed take is not listed again until the claim expires, and a grading upload clears the claim, so the poll wake and a manual "check now" cannot grade the same take twice at once. Unknown or revoked credentials get a 401 from both routes.

## 10. Test run

Before the first class use, run one pass with your own address on the roster of a test exam:

1. Build the assignment with the teacher skill (section 8), including your model take and the approved key.
2. Sign in through the emailed link in the app as a student; record a short take; stop. The end screen shows a sealed session code and the audio fingerprint.
3. Grade it with the student skill (section 8, step 4): the attempt, its corrected transcript, feedback and per-point grades appear in the Results tab, and the standing grade equals that attempt's grade.
4. Record a second, better take and grade it: the standing grade rises to the better attempt's.
5. On the Muse tokens tab, generate your watch credentials, email them to yourself, set up the watch in your Muse, seal a third take, and say "check now": the take is graded without the paste block.
6. Delete the test exam (this deletes its page, key, roster and results with it).

## Go-live record

Completed 2026-11-05: the R2 bucket `seb-exams-audio` was created on Nov 4; the migrations of sections 2 were applied to live D1 in order with no conflicts; the Worker was deployed with the AUDIO binding live and the `/k/*` and audio routes verified answering on the live server; the recording app is published at https://chetools.github.io/muse/keypoints-app/. Watch grading went live 2026-11-06 with the `/w/*` routes and the Muse tokens tab deployed. Remaining at first go-live: the teacher creates the first assignment exam, rosters their own address, and generates the audit token (section 8).
