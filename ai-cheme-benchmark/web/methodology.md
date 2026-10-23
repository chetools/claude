## Prompt

Every model received the same two messages. The system message was

> You are taking an undergraduate chemical engineering exam. Solve the problem carefully, showing your
> working. At the end, give one line per part, exactly in the form
> FINAL (a): <number> <unit>
> using the part letters of the problem.

The user message was the problem statement exactly as shown in the Problems tab (the text below the header
of `problems/PNN.md`), with nothing added. Each problem was a separate conversation.

## Sampling settings

- One run per model and problem.
- Temperature, top-p and the maximum number of output tokens were not set, so each provider's defaults
  applied. Replies cut off at the provider's output limit are marked "[reply cut off …]" and were graded
  as they stand.
- No tools, no code execution, no web access.
- Reasoning models ran with their default reasoning setting; no effort level was requested (Effort column: —).
- The requests went through OpenRouter, which picks the serving provider. @@N_TRUNCATED@@

## Grading rubric

Each problem is worth 10 points, split over its parts as shown next to each part in `python/rubric.py`.
For each part:

- **Full points:** the final value is within 1 % of the reference (2 % for values that depend on an
  iterative friction-factor or stage-stepping result: P02–P04, P11 (d), P12 (e)), with a sound method.
  Integer answers (P11 (e)) and the flow direction in P03 (c) must match exactly.
- **Half points:** correct method and set-up, but a numerical slip, a rounding carried through, or a
  value 1–5 % off; also a correct value carried forward from the model's own wrong earlier part
  ("error carried forward") when the method of this part is right.
- **Zero:** wrong method or formula, a missing part, a value more than 5 % off without a correct method,
  or a value with no supporting working.

The working is graded, not only the FINAL lines: a FINAL value that contradicts the working gets the
credit of the working. A model's score is the mean of its problem scores, in percent.

The grader was an AI model, Claude Opus 5.5, in one session: one grader instance per problem, which graded
the replies of all models to that problem in one pass, so that the same mistake got the same deduction. It
saw the problem, the reference answers, the reference solution and the rubric, graded the reply text only
(not any hidden reasoning), and wrote the one-to-four-sentence justification shown under each reply. The
instructions it followed are in `python/grading_prompt.md`.

As a check on the grader, a script (`tests/check_grades.py`) read the FINAL lines of every reply and
flagged each part where the grader gave full points to a value more than 5 % off the reference, or zero
to a value within 1 % of it. @@N_FLAGS@@

## Models and metadata

The table in the Results tab lists every model. Release dates are the month of the vendor's release
announcement or model card, given to the month. Parameter counts are total parameters, in billions, from
the model card linked below; for mixture-of-experts models the active parameters per token are given in
brackets. OpenAI does not publish the size of GPT-3.5 Turbo or GPT-4o mini, so they have no parameter
count and are left out of the score-versus-parameters chart.

@@MODEL_SOURCES@@

## Cost

The cost of each model is the sum, over its replies, of the cost OpenRouter reported for each request
(`usage.cost` in the response), in US dollars, at the prices of @@RUN_DATE@@. Models marked "free" were
served on OpenRouter's free tier. The grading cost is not included. @@TOTAL_COST@@

## Calibration changes

@@CALIBRATION@@

## What was not verified

- The grades are one AI grader's judgement. No human graded the replies, and no second grader was
  compared, apart from the FINAL-line check described above.
- Release dates and parameter counts are taken from the vendors' pages linked above and were not
  checked further.
- Which provider served each request, and with which settings, is as reported by OpenRouter.
- The reference answers were checked against an independent second solution for every part (Code tab),
  but not against a textbook answer key.
