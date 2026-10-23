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

The table in the Results tab lists every model. Release dates are given to the month. Parameter counts are total parameters, in billions, from
the model card linked below; for mixture-of-experts models the active parameters per token are given in
brackets. OpenAI does not publish the size of GPT-3.5 Turbo or GPT-4o mini, so they have no parameter
count and are left out of the score-versus-parameters chart.

@@ABSENT@@

- Llama 3.2 3B Instruct (`meta-llama/llama-3.2-3b-instruct`): released 2024-09; parameters 3.2B; [source](https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct)
- Llama 3.2 1B Instruct (`meta-llama/llama-3.2-1b-instruct`): released 2024-09; parameters 1.2B; [source](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct)
- Llama 3.1 8B Instruct (`meta-llama/llama-3.1-8b-instruct`): released 2024-07; parameters 8.0B; [source](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct)
- Mistral Nemo (`mistralai/mistral-nemo`): released 2024-07; parameters 12.2B; [source](https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407)
- GPT-3.5 Turbo (`openai/gpt-3.5-turbo`): released 2023-03; parameters not published
- Llama 3.3 70B Instruct (`meta-llama/llama-3.3-70b-instruct`): released 2024-12; parameters 70.6B; [source](https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct)
- GPT-4o-mini (`openai/gpt-4o-mini`): released 2024-07; parameters not published
- Qwen2.5 7B Instruct (`qwen/qwen-2.5-7b-instruct`): released 2024-09; parameters 7.6B; [source](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct)
- Qwen2.5 72B Instruct (`qwen/qwen-2.5-72b-instruct`): released 2024-09; parameters 72.7B; [source](https://huggingface.co/Qwen/Qwen2.5-72B-Instruct)
- Gemma 4 31B (free) (`google/gemma-4-31b-it:free`): released 2026-03; parameters 31.3B; [source](https://huggingface.co/google/gemma-4-31B-it)
- Gemma 4 26B A4B  (free) (`google/gemma-4-26b-a4b-it:free`): released 2026-03; parameters 25.8B (3.8B active); [source](https://huggingface.co/google/gemma-4-26B-A4B-it)
- Nemotron 3 Ultra (free) (`nvidia/nemotron-3-ultra-550b-a55b:free`): released 2026-06; parameters 560.5B (55B active); [source](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16)
- Nemotron 3 Super (free) (`nvidia/nemotron-3-super-120b-a12b:free`): released 2026-03; parameters 123.6B (12B active); [source](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16)
- Nemotron 3 Nano Omni (free) (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`): released 2026-04; parameters 33.0B (3B active); [source](https://huggingface.co/nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-BF16)
- LFM2.5-2.6B (free) (`liquid/lfm-2.5-2.6b:free`): released 2026-08; parameters 2.7B; [source](https://huggingface.co/LiquidAI/LFM2.5-2.6B)
- Gemma 3 4B (`google/gemma-3-4b-it`): released 2025-03; parameters 4.3B; [source](https://huggingface.co/google/gemma-3-4b-it)
- Gemma 3 27B (`google/gemma-3-27b-it`): released 2025-03; parameters 27.4B; [source](https://huggingface.co/google/gemma-3-27b-it)
- Phi 4 (`microsoft/phi-4`): released 2024-12; parameters 14.7B; [source](https://huggingface.co/microsoft/phi-4)

## Cost

The cost of each model is the sum, over its replies, of the cost OpenRouter reported for each request
(`usage.cost` in the response), in US dollars, at the prices of 23 October 2026 (the run date). Models marked "free" were
served on OpenRouter's free tier. The grading cost is not included. @@TOTAL_COST@@

## Calibration changes

None. The problems, the reference solutions and the rubric were fixed before any reply was collected
and were not changed after grading.

## What was not verified

- The grades are one AI grader's judgement. No human graded the replies, and no second grader was
  compared, apart from the FINAL-line check described above.
- Release dates were collected before the run and not checked against a primary source; parameter
  counts are from the model cards linked above and were not checked further.
- Which provider served each request, and with which settings, is as reported by OpenRouter.
- The reference answers were checked against an independent second solution for every part (Code tab),
  but not against a textbook answer key.
