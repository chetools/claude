# Transcript exams — install on top of the live SEB Exams install

This adds transcript exams to the existing seb_exams system: students record a spoken explanation in a web app, the transcript is sealed on the server as it is recorded, the student has it graded by their own Muse using the teacher's prompt, and the server re-grades (grades only) as an audit and flags disagreements for the teacher. Only the new steps are given here; the base install is `docs/SETUP.md` and must already be working (Worker deployed, D1 database `seb-exams`, teacher sign-in by emailed link through the Apps Script sender).

Nothing exam-specific is hard-coded in the Worker. Each exam's prompt, rubric, variations, student app address and times are stored in the database and edited in the teacher app; the audit model connection (provider, service address, model) is a setting in the teacher app, and only its key is a server secret.

## 1. Files

Copy into the repository, in place:

- `worker/src/transcript.js` — new: student sign-in, sealing, grading support, teacher API (`/t/*`, `/api/t/*`).
- `worker/src/index.js` — changed: two lines (import `handleTranscript`; route `/t/` and `/api/t/` to it).
- `worker/schema-transcript.sql` — new: additive tables (`t_exams`, `t_exam_teachers`, `t_roster`, `t_login_tokens`, `t_student_sessions`, `t_login_requests`, `t_submissions`, `t_settings`).
- `worker/schema-audio.sql` — one-time migration for audio takes (adds `audio_json`, `audio_fingerprint`, `transcription_json` to `t_submissions`). Fresh installs do not need it: `schema-transcript.sql` already creates the columns.
- `worker/public/js/transcript.js` — new teacher-app module (list, model connection, and the Exam / Roster / Results tabs), in the same shell and style as the rest of the teacher app.
- `worker/public/js/app.js` — changed: a "Transcript exams" link in the top navigation and the `#/texams` and `#/texam/<id>/<tab>` routes.
- `tests/` — new local tests (optional in the repo; not deployed).

## 2. Database

From `worker/`:

```
npx wrangler d1 execute seb-exams --remote --file schema-transcript.sql
```

The script is additive and safe to re-run. It drops nothing.

## 3. Secrets

From `worker/`:

```
npx wrangler secret put SEAL_SECRET
npx wrangler secret put MODEL_API_KEY
```

- `SEAL_SECRET` seals transcripts (a keyed code over each sealed record). Use a long random value, for example the output of `openssl rand -hex 32`. Sealing fails closed without it. Changing it later invalidates the receipts of earlier seals (the sealed transcripts themselves stay readable in results).
- `MODEL_API_KEY` is the key for the audit model connection set in the teacher app. It is optional: without it, or without a connection configured, submissions are stored with the audit marked not run and nothing is flagged.

`MAIL_URL`, `MAIL_SECRET` and `ADMIN_EMAIL` are unchanged: student sign-in links are sent by the same Apps Script sender as teacher links.

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

Spoken takes can be sealed from their audio instead of from a browser-made transcript: the recording app uploads one audio file per slide, the Worker stores the files in a Cloudflare R2 bucket, seals a fingerprint of the audio, and transcribes the files itself through the model connection (section 7, step 2). This needs a one-time R2 setup on the Cloudflare account that holds the Worker.

1. **Open R2.** Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) with the account that holds the seb-exams Worker. In the left sidebar choose **Storage & databases → R2 Object Storage → Overview**.
2. **Add the R2 subscription (first time only).** If the page offers **Add R2 subscription to my account** (or a checkout button), complete it. Cloudflare requires a payment method on file to enable R2, even for free use; if asked, add one under **Manage Account → Billing → Payment**. The amount due is $0: the subscription includes, each month, 10 GB-month of Standard storage, 1 million write operations and 10 million read operations free, and downloads (egress) are free. A class's audio — a few megabytes per student, deleted under step 5 — stays far inside that allowance.
3. **Create the bucket.** On the R2 Overview page choose **Create bucket**. Name it exactly `seb-exams-audio` (the name must match `worker/wrangler.toml`; a mismatch makes every audio upload fail). Leave location on **Automatic** and storage class on **Standard** — do not choose Infrequent Access, which has no free tier and charges for a 30-day minimum even if files are deleted sooner. Choose **Create bucket**.
4. **Keep the bucket private.** Do not enable public access, an `r2.dev` subdomain, or a custom domain on this bucket. Nothing needs them: the Worker reads and writes the bucket through its binding, and teachers listen through the results view. Student audio must not be publicly reachable.
5. **Set the retention rule.** Open the bucket → **Settings → Object lifecycle rules → Add rule**. Name it `delete exam audio`; set the prefix to `exams/` (every audio file's name starts with that prefix); set the action to **Delete objects** after **30 days** (or the period you have told students; keep it long enough for grading disputes to be settled); enable the rule and save. Deleting an exam in the teacher app deletes its audio immediately; this rule is the backstop for everything else. Note the cost arithmetic: storage is charged per GB-month pro-rated by the day, and deletes are free, so audio held for days costs effectively nothing at class scale.
6. **Apply the database migration.** From `worker/`: `npx wrangler d1 execute seb-exams --remote --file schema-audio.sql`. Run it once; a second run reports duplicate-column errors, which are harmless.
7. **Connect the bucket to the Worker.** In `worker/wrangler.toml`, uncomment the three `[[r2_buckets]]` lines at the bottom (binding `AUDIO`, bucket `seb-exams-audio`). The bucket must exist before this deploy, or the deploy fails.
8. **Set the transcription model and key.** The transcription uses the same model connection as the audit: set `MODEL_API_KEY` if it is not already set (`npx wrangler secret put MODEL_API_KEY`), rebundle and deploy as in section 5, then in the teacher app under **Transcript exams → Model connection** set the service address and the **Transcription model** (for OpenAI, `whisper-1` or `gpt-4o-mini-transcribe`). The same card reports "Audio storage (R2) is connected" once the binding is live. Without a transcription model or key, takes still seal — they are held as `audio_sealed` and the teacher runs **Transcribe audio** from the results view once the connection is set.
9. **Test.** Run one signed-in test take (section 8). The end screen shows an audio fingerprint as well as a transcript fingerprint; in the results view the submission shows its sealed audio with a player per slide. If an audio upload fails with a 500 error, the binding or bucket name is wrong (steps 3 and 7); if the take seals but stays `audio_sealed`, the transcription model or key is missing (step 8).

## 7. Recording app and grading skill

- Publish the sealing build of the recording app (`app-v22-sealing.html` from the Bernoulli app project, for audio sealing) as the app page, or point the exam's student app address at wherever it is published. The app alone, without sign-in, behaves exactly as before.
- Students grade with the `local-transcript-grading` skill: give them the skill folder to add to their Muse, the course server address (the Worker origin), and nothing else. The sealed session code is printed in each student's own app summary after a sealed take. For an audio-sealed take, the student's Muse downloads the sealed per-slide audio from the server under that code, transcribes it, grades its own transcript against your prompt and rubric, and uploads transcript, critique and grades together. The server stores their transcript as the student's-Muse transcript; when the server transcription (section 6, step 8) is configured, it also transcribes the same audio at upload time, makes that the canonical transcript, and flags the submission if the student's transcript differs from it in fewer than 60% shared words, in addition to the usual audit grade comparison. The teacher view shows both transcripts and the sealed audio.

## 8. First exam

1. Open the teacher app and choose "Transcript exams" in the top navigation (directly: `https://<worker-origin>/index.html#/texams`), signed in with the emailed link, as usual.
2. Under "Model connection", set the provider name, the service address (base URL of an OpenAI-style service, for example `https://api.openai.com/v1`), the model (audit re-grade), and the transcription model (audio takes, for example `whisper-1`). Save.
3. "New transcript exam". The Bernoulli defaults are prefilled (student app address, assignment name, the six-element rubric, four variations). Write the grading prompt, set the opening and closing times — a take can only start while the exam is open — and save.
4. Paste the roster, one student per line as `Name, email`. Only rostered students can sign in. Save.
5. Give students the link shown in the editor (the app address with the exam code and server). Students open it, enter their school email in the app, open the emailed sign-in link on the same device, and record.

## 9. Test run

Before the first class use, run one pass with your own address on the roster of a test exam:

1. Sign in through the emailed link in the app; record a short typed take; stop. The end screen shows a sealed session code and receipt.
2. In the teacher app, the submission appears as `sealed`.
3. Grade it with the skill, first with honest grades (result: `graded`), then — on a second test take — with deliberately inflated grades (result: `flagged`, elements listed).
4. In the results view, settle the flagged submission with your own fractions and a comment; download the CSV and check the final points.
5. Delete the test exam (this deletes its roster, transcripts and results with it).

## Notes

- Sign-in links are valid 15 minutes and work once; at most 5 per address per hour. A student sign-in lasts 12 hours, covering the take and the grading that follows.
- The audit flags an element when the student's grade and the audit grade differ by more than 0.25 of the element's range. The teacher's fractions, entered in the results view, are the final grades; the CSV reports student, audit and final points per element.
- Editing an exam's prompt or rubric raises its prompt version; each sealed submission records the version it was sealed under, and the grading packet sends that version.
- Transcripts are visible only to the exam's owner, its co-teachers and admins. Deleting an exam deletes its transcripts and results.
- A transcript entered by hand in the results view (for exceptions) is stored marked teacher-entered and unsealed; it can be graded through the same packet and upload flow, using its session code from the results list.

## 8. Practice attempts, final submission, and teacher-Muse validation

Students practise as often as they like: each take is sealed, their own Muse transcribes and grades it, and they see the feedback at once — no teacher time and no server model is used. Only a take the student marks **final** (their Muse adds `"final": true` to the grading upload, at the student's word) needs the teacher. A final submission locks the exam for that student until released, and its grade is set by validation on the teacher's own Muse account.

1. Apply the one-time migration once, after `schema-audio.sql`:
   `wrangler d1 execute seb-exams --remote --file worker/schema-practice.sql`
   It adds the attempts table, the final-submission marker, and the audit-token hash column.
2. In the teacher app, open the exam's Exam tab, section "Teacher-Muse validation", and generate the audit token. It is shown once; only its hash is stored. Generating a new one replaces the old.
3. Give your Muse the `local-transcript-validation` skill folder, the course server address, the exam ID, and the token. Ask it to validate the final submissions: it lists what awaits validation, downloads each final take's sealed audio, transcribes and grades it independently, and submits its transcript and grades. The server compares them with the student's (transcript word similarity at least 0.6, no rubric element differing by more than a quarter of its range). On agreement, your Muse's grades become the final grade. On disagreement the submission is flagged in Results for you to settle; a flagged submission is not re-validated automatically.
4. To let a student start over after a final submission, open their result and use "Release final submission" — the final marking and any final grade set from it are cleared, and their graded attempts remain in the attempt history (the Results detail shows the attempt count).

With this flow the server model connection (section 6, step 8) is optional: it only adds an at-upload transcription cross-check. Validation and the final grade do not depend on it, and no `MODEL_API_KEY` is needed for them.

## 9. One sealed picture per submission (app v23)

The v23 recording app adds two camera measures. Before a spoken take, a camera check runs in the page: where the browser provides face detection it confirms one face, centred and facing the camera; where it cannot, the student confirms their own framing. The outcome (confirmed, self-confirmed, or not confirmed) is recorded with the submission — the check never blocks a take outright. During the take, one picture is captured at a randomised moment (25–100 seconds in, or at the end of a shorter take) and uploaded before sealing; the seal's fingerprint covers it.

1. Apply the one-time migration once, after `schema-practice.sql`:
   `wrangler d1 execute seb-exams --remote --file worker/schema-photo.sql`
2. Publish `app-v23-sealing.html` as the exam app (it replaces v22 unchanged in every other respect).
3. Pictures live in the same R2 bucket as the audio. A student's earlier attempts' pictures are kept when a new take starts (validation compares them); deleting the exam deletes all of them.
4. In Results, each submission shows its picture with the capture time and the camera-check outcome. During validation (section 8), your Muse downloads the final take's picture and the earlier attempts' pictures, judges whether they show the same person, and includes the verdict in its validation upload; a "different person" verdict flags the submission for you and never fails it automatically.

## 10. Scene-change captures (app v24)

The v24 app also watches the camera picture during a take: it samples the frame four times a second at small size, and when the scene changes suddenly (someone leaving, a different person, the camera covered or moved) it captures a full frame — at most 12 per take, at least 3 seconds apart. Captures are uploaded before sealing and covered by the seal, like the picture.

1. Apply the one-time migration once, after `schema-photo.sql`:
   `wrangler d1 execute seb-exams --remote --file worker/schema-motion.sql`
2. Publish `app-v24-sealing.html` as the exam app (it replaces v23 unchanged in every other respect).
3. Results shows the captures as thumbnails with their times. During validation (section 8), your Muse downloads them with the pictures and reports what changed at each one, with its timestamp; the note is stored with the validation, and a capture showing a different person is reported through the same picture verdict as the submission picture (section 9, step 4). A new take deletes the previous take's captures (its picture is kept); deleting the exam deletes everything.

## 11. Keypoints assignments (explain-the-page)

A keypoints assignment replaces the rubric exam flow with the teacher-page flow: the teacher's typeset page is the assignment material, the teacher's model take sets the standard, and students re-record against per-point feedback with the best attempt's grade standing. The server holds custody only — no transcription or audit runs on the server in this flow (keep `MODEL_API_KEY` unset for these exams), and all transcription and judgement happen in the teacher's and students' Muse apps through the two published skills.

1. Apply the one-time migration once, after `schema-motion.sql`:
   `wrangler d1 execute seb-exams --remote --file worker/schema-keypoints.sql`
   It adds the roster `role` column and the `k_pages` / `k_keys` tables; the `ALTER TABLE` runs once.
2. Deploy the Worker (it carries the `/k/*` routes in `worker/src/keypoints.js`).
3. Publish `app-v28-keypoints.html` (in the Bernoulli app project folder) as the assignment app, and set each keypoints exam's app address to it.
4. Create the exam in the teacher app as usual (title, dates, roster) and generate its audit token (section 8's token, reused). The teacher skill (`keypoints-teacher-skill` in chetools/muse) takes the server address, exam ID, and audit token: it uploads the typeset page, enrols the teacher's email as the model identity, and — after the teacher records the model take in the app — downloads that take, transcribes and corrects it locally, drafts the answer key, and uploads the teacher-approved, weighted key. Approving the key projects it onto the exam's rubric and opens the assignment.
5. Students record in the same app, paste the end-screen block into their Muse (the `keypoints-grading-skill`), and receive per-point feedback and a grade per attempt; the standing grade is the best attempt's, served by `/k/standing`.
