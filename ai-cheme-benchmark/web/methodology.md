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
- Exception: Muse Spark 1.3 was not called through OpenRouter. Its replies were produced in the Muse app,
  one fresh agent per problem, each given only the system message above and the problem statement, with no
  tools and no code execution (as stated in the file of replies), and were pasted into this project by the
  user. Its sampling settings are not known, and its cost is shown as $0 because the Muse app did not charge
  for the run.
- Exception: Claude Sonnet 5.5 and Claude Haiku 5.5 were not called through OpenRouter either. Each reply
  came from a fresh Claude Code sub-agent (one per model and problem) whose task was the system message
  above, the problem statement, and one added line: "Do not use any tools (no files, no code, no search).
  Answer from your own knowledge in a single reply; your reply is recorded verbatim as your exam answer."
  The sub-agents also carried Claude Code's own system prompt, which the other models did not have. Every
  sub-agent's transcript was checked: none called a tool apart from handing its answer back. The reply is
  the sub-agent's first answer with FINAL lines, verbatim, or its hand-back message when it gave no other
  answer; text written after the harness asked a sub-agent to hand its answer back (repeats of the answer)
  is not part of the reply. Their sampling
  settings are Claude Code's defaults, and their cost is not shown ("—") because these runs are not billed
  per request.

## Which models were run

The models were added in steps, roughly in order of release, to follow the progress of widely available
models over time: small and older models first, then 2024 flagships (GPT-4o, Mistral Large 2, DeepSeek V3),
the first widely available reasoning models (o3, DeepSeek R1, Gemini 2.5 Pro), late-2025 models (GPT-5,
GPT-5.2, Claude Sonnet 4.5, Claude Opus 4.5) and 2026 models (Gemini 3.1 Pro, Claude Opus 4.8). Claude
Opus 5.5 was also run, but it is not shown: it is the grader, so its replies were graded by the model
itself (its replies and grades are kept in `results/`). Claude Sonnet 5.5 and Claude Haiku 5.5 were added in
its place, run as sub-agents (see Sampling settings); their release month is shown as 2026-10, the month
they were run, and was not checked. GPT-4 Turbo, o3-mini and o4-mini were planned but OpenAI has retired them, so they could not be
called. GPT-4 and o1 were left out to stay within the budget. Muse Spark 1.3 (Meta) was added last, run
outside OpenRouter (see Sampling settings); its release month is shown as 2026-10, the month it was run, and
was not checked against an announcement.

Problems P13–P15 were written after P01–P12 had been graded for the models up to Claude Opus 4.5, to be
much harder than P01–P12 (coupled nonlinear systems solved by hand). At first they were given only to the
models that scored 10/10 on every one of P01–P12; to compare every model on the same fifteen problems, all
the other models were then run on them as well, with the same prompt and settings. Their reference
solutions were checked against an independent second solution like the others. They were written once and
not changed after any model's reply was seen; no model was tried on them before they were fixed.

## Difficulty levels

Each problem has a difficulty level from 1 to 5, judged for an undergraduate chemical-engineering student who
has taken the relevant course (fluid mechanics, process dynamics and control, or separations). The levels
describe what a problem demands of the student, not how the AI models scored on it.

- **Level 1, direct application** (P01, P05, P09). The problem maps onto one standard result from the course,
  such as the laminar friction factor, the step response of a first-order system or the Fenske equation. The
  work is to identify that result, substitute the data with consistent units and evaluate it; no iteration and
  no modelling decisions are needed.
- **Level 2, routine multi-step analysis** (P02, P06, P10). Several standard relations are chained, and one of
  them may be implicit, such as the Colebrook equation solved by simple successive substitution. The student
  has to set up a balance (a mechanical-energy balance, a component balance) and match a transfer function to
  its standard form, but the path to the answer is the one taught in lectures.
- **Level 3, analysis with one nonlinear step** (P07, P08). The problem requires a frequency-response or
  stability analysis, with one nonlinear scalar equation solved numerically by hand (the phase-crossover
  frequency) or a symbolic stability test carried through (the Routh array), and the results then reused in
  later parts. An error in the first step propagates through the rest.
- **Level 4, coupled or stage-wise calculation** (P03, P04, P11, P12). Several unknowns are coupled: flows and
  friction factors in a pipe network, the friction factor and mass flux in compressible flow, or stage-by-stage
  stepping between equilibrium and operating lines. The student must organise a systematic iteration or a
  long sequence of dependent calculations, and keep track of convergence and of the many intermediate values.
- **Level 5, design-scale nonlinear problem** (P13, P14, P15). The problem is closer to a design-project task
  than to an examination question: a pumped two-loop network with a demand node, a dead-time control loop
  analysed for gain and phase margins and peak sensitivity without approximations, or a ternary flash with
  bubble, dew and fixed-vaporisation conditions. It requires solving coupled nonlinear systems by hand with
  care over every intermediate result.

The levels follow the ratings set when the problems were written: level 1 was "Easy", 2 "Medium", 3 "Hard",
4 "Extremely hard" and 5 "Frontier". P07 and P08 were moved from "Extremely hard" to "Hard" after grading,
because each needs only one scalar root or a closed-form stability test, while P03, P04, P11 and P12 need
coupled iterations or stage-by-stage calculations. No grade depends on the level.

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
Note that the grader is a model from the same family as the graded Claude models, and from the same
generation as Claude Sonnet 5.5 and Claude Haiku 5.5; the grader's own replies are left out for this reason. It
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
- Which provider served each request, and with which settings, is as reported by OpenRouter. For
  Muse Spark 1.3 nothing is known beyond the replies themselves. The Sonnet 5.5 and Haiku 5.5 sub-agents
  ran under different conditions from the others (an extra instruction line and Claude Code's system
  prompt), so their comparison with the other models is not exact.
- The reference answers were checked against an independent second solution for every part (Code tab),
  but not against a textbook answer key.


## Types of mistakes

Every part that lost points has one label for the main cause of the loss, shown in the grid under each problem and
next to each reply. Labels were assigned after grading, from the grader's justification for that part (and the reply
itself where the justification was not enough); they do not change any score. A part that only repeats an earlier
wrong value carries the type of the original mistake, and its note starts "Carried from".

@@ERROR_TYPES@@

When more than one type could fit, these rules decide, in this order (the first that fits wins):

@@ERROR_RULES@@

@@ERROR_AGREEMENT@@
