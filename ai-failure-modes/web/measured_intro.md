## 1. What was measured

Rather than estimate my failure rate, I measured it. Each of 25 questions was put to [[m_runs_per]] fresh
Opus 5.5 sessions ([[m_runs]] runs in total), worded the way a user would ask it, with no hint that it was a test and
no request to be careful. Each session had the normal tools of a Claude Code session (code execution, file tools,
web search and fetch, pip). Each worked in its own empty scratch folder, and the repository's root `CLAUDE.md` was
loaded, as it is in every session in this repository. That file asks for computed rather than recalled numbers,
which probably helps. No run read this project's files or its published page; the transcripts were checked for that.

Each answer was graded by an independent Opus 5.5 grader against a reference computed independently (CoolProp,
IAPWS-IF97, scipy, Crossref, eCFR), with a stated acceptance band. The graders also listed every *side* statement they
could check and found false. I re-checked the reported side errors with my own code. Runs were made on 2026-10-29.

## 2. Results

| | |
|---|---|
| Graded answers | [[m_graded]] (one question, the column ΔP diagnosis, is not graded) |
| Main answer correct | **[[m_correct]] of [[m_graded]]** |
| Main answer wrong | [[m_wrong]] |
| Runs that computed or looked the answer up (did not answer from memory) | [[m_tools]] of [[m_runs]] |
| Runs with at least one false side statement | **[[m_side_runs]] of [[m_runs]]** ([[m_side_n]] false statements) |

With 0 wrong main answers in [[m_graded]] graded runs, the 95 % upper bound on the true error rate *for questions
like these, asked this way* is about [[m_ub_all]] %. For any single question (0 of 5 wrong) the bound is only about
[[m_ub_q]] %: five runs cannot show that a trap is safe, only that it is not a common failure.

### 2.1 What this means for the App tab

The App tab's ten cases each show an answer I would "likely" give and my own subjective estimate of the chance of
getting it wrong (15–50 % for most). **In this measurement those estimates were far too pessimistic:** with tools and
this repository's `CLAUDE.md`, every run of all ten cases avoided the trap and gave the corrected answer. The App
tab shows the measured result next to each self-estimate.

### 2.2 Where the errors actually were

Every observed error was in a side remark, never the headline number. The answer looked carefully checked, and
the aside next to it was wrong:

[[side_table]]

The most frequent was a unit label: 3 of 5 runs of the compressor question wrote the wrong-method result as
"433 K (160 °C)" instead of 433 °C (706 K), and 2 of them then stated the wrong direction of the error.

### 2.3 Limits of this test

- **I wrote the questions.** I chose traps I already know about, so I was likely to handle them. Errors I do not know
  I make cannot be found this way; that needs questions from engineers with plant experience.
- **The questions were well posed.** Each one gave the data needed. Ambiguous or incomplete questions, long
  multi-step tasks, and questions where the right move is to push back were not tested.
- **Not tested at all:** reading charts or P&IDs, whole-flowsheet consistency, plant-floor diagnosis (the one such
  question was not graded), costing, and anything after my training cutoff. For these, the App-tab write-ups remain
  unverified expectations.
- **The setting matters.** Without tools, or without a `CLAUDE.md` that asks for computed numbers, results may differ;
  that was not measured.

### 2.4 Prompt that targets the observed failures

```
Before you answer, re-check every number in the answer, including the asides, comparisons and
"if you had done X" examples, not only the final result. Recompute each one in code and check its unit.
```

## 3. The 25 questions and the answers

Each question below shows the verdicts, whether the runs computed the answer, the reference, and how a user
would catch the trap. The five verbatim answers are collapsed under each question.
