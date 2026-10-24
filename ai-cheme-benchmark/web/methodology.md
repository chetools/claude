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
  applied. One exception: Claude Opus 4.5 was run with a 16 000-token output limit, because OpenRouter
  refused its default limit (64 000 tokens) for lack of prepaid credit; its longest reply used 1 859 tokens. Replies cut off at the provider's output limit are marked "[reply cut off …]" and were graded
  as they stand.
- No tools, no code execution, no web access.
- Reasoning models ran with their default reasoning setting; no effort level was requested.
- The requests went through OpenRouter, which picks the serving provider. @@N_TRUNCATED@@

## Which models were run, and the Frontier problems

The models were added in steps, roughly in order of release, to follow the progress of widely available
models over time: small and older models first, then 2024 flagships (GPT-4o, Mistral Large 2, DeepSeek V3),
the first widely available reasoning models (o3, DeepSeek R1, Gemini 2.5 Pro), late-2025 models (GPT-5,
GPT-5.2, Claude Sonnet 4.5, Claude Opus 4.5) and 2026 models (Gemini 3.1 Pro, Claude Opus 4.8, Claude
Opus 5.5). GPT-4 Turbo, o3-mini and o4-mini were planned but OpenAI has retired them, so they could not be
called. GPT-4 and o1 were left out to stay within the budget.

Problems P13–P15 ("Frontier") were written after P01–P12 had been graded for the models up to Claude Opus
4.5, to be much harder than P01–P12 (coupled nonlinear systems solved by hand). They were given only to
models that scored 10/10 on every one of P01–P12. Their reference solutions were checked against an
independent second solution like the others. They were written once and not changed after any model's
reply was seen; no model was tried on them before they were fixed. The choice of who gets them depends
on the P01–P12 grades, so the Frontier scores compare only the models that qualified.

## Grading rubric

Each problem is worth 10 points, split over its parts as shown next to each part in `python/rubric.py`.
For each part:

- **Full points:** the final value is within 1 % of the reference (2 % for values that depend on an
  iterative friction-factor or stage-stepping result: P02–P04, P11 (d), P12 (e), P13 (c), P15 (c)), with
  a sound method. Integer answers (P11 (e)) and the flow directions in P03 (c) and P13 (c) must match
  exactly. Temperatures in P15 (a), (b) and (e) must be within 0.2 °C (half points for 0.2–1 °C with a
  sound method). A part with several values (P14 (b)–(f)) gets full points only if every value is within
  tolerance.
- **Half points:** correct method and set-up, but a numerical slip, a rounding carried through, or a
  value 1–5 % off; also a correct value carried forward from the model's own wrong earlier part
  ("error carried forward") when the method of this part is right.
- **Zero:** wrong method or formula, a missing part, a value more than 5 % off without a correct method,
  or a value with no supporting working.

The working is graded, not only the FINAL lines: a FINAL value that contradicts the working gets the
credit of the working. A model's score is the mean of its problem scores, in percent.

The grader was an AI model, Claude Opus 5.5, in one session: one grader instance per problem, which graded
every model's reply to that problem, so that the same mistake got the same deduction. As models were added
in steps, each instance graded the new replies in a further batch, keeping its earlier grades unchanged.
Note that the grader is a model from the same family as some of the graded Claude models. It
saw the problem, the reference answers, the reference solution and the rubric, graded the reply text only
(not any hidden reasoning), and wrote the one-to-four-sentence justification shown under each reply. The
instructions it followed are in `python/grading_prompt.md`.

As a check on the grader, a script (`tests/check_grades.py`) read the FINAL lines of every reply and
flagged each part where the grader gave full points to a value more than 5 % off the reference, or zero
to a value within 1 % of it. @@N_FLAGS@@

## Models and metadata

The table in the Results tab lists every model. Release dates are given to the month. Parameter counts are total parameters, in billions, from
the model card linked below; for mixture-of-experts models the active parameters per token are given in
brackets. Models whose vendor has not published a parameter count (all OpenAI, Anthropic and Gemini
models here) have none and are left out of the score-versus-parameters chart.

@@MODEL_SOURCES@@

@@ABSENT@@

## Cost

The cost of each model is the sum, over its replies, of the cost OpenRouter reported for each request
(`usage.cost` in the response), in US dollars, at the prices of 23–24 October 2026 (the run dates). Models marked "free" were
served on OpenRouter's free tier. The grading cost is not included. @@TOTAL_COST@@

## Calibration changes

P01–P12, their reference solutions and their rubric were fixed before any reply was collected and were not
changed after grading. P13–P15 and their rubric lines were added later, as described above; they were
fixed before any model saw them.

## What was not verified

- The grades are one AI grader's judgement. No human graded the replies, and no second grader was
  compared, apart from the FINAL-line check described above.
- Release dates were collected before the run and not checked against a primary source; parameter
  counts are from the model cards linked above and were not checked further.
- Which provider served each request, and with which settings, is as reported by OpenRouter.
- The reference answers were checked against an independent second solution for every part (Code tab),
  but not against a textbook answer key.
