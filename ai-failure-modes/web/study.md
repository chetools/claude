## 1. Summary

**Question.** Where does an AI model (here Claude, Opus 5.5) give confident but wrong chemical-engineering answers that
an engineer with plant experience would catch, how large are the errors, and how should users prompt to avoid them?

**What was done.** First, ten classic traps were built as live calculations: gauge vs absolute pressure, choked
flow, non-ideal VLE and others. Each shows the "naive" answer next to the corrected one, with my own estimate of how
often I would fall into the trap ([App tab](#case-compressor)). Then, instead of relying on that estimate, 25
questions (the ten traps plus fifteen more) were put to fresh Opus 5.5 sessions, five times each, and every answer
was graded against an independently computed reference ([Measured tab](#m-1)).

**Main result.** Of [[m_graded]] graded answers, **[[m_correct]] were correct and [[m_wrong]] wrong**. All 50 runs of
the ten original traps avoided the trap. The errors that did occur were false **side statements** next to correct
headline answers: [[m_side_n]] of them, in [[m_side_runs]] of [[m_runs]] runs. The commonest was a wrong unit label
in an aside.

**Conclusion.** For well-posed questions in a session with tools and a `CLAUDE.md` that asks for computed numbers,
the textbook traps were not the problem: my self-estimates (15–50 % wrong) were far too pessimistic. The problem was
unchecked numbers in asides and comparisons. Check those, and do not read this result as covering ambiguous
questions, sessions without tools, or problems I did not think to ask ([§6](#s-6)).

## 2. Initial hypothesis

The starting assumption, stated on the first version of this page, was that in these ten problems I would often give
the naive answer when the prompt did not warn about the trap. These were my subjective estimates of the chance of a
wrong setup, written before any measurement:

| Problem | Trap | Self-estimate (prompt silent on the trap) |
|---|---|---|
| [1. Gauge vs absolute pressure](#case-compressor) | compression ratio from gauge readings | 20–35 % |
| [2. Pipe pressure drop](#case-pipe) | fittings left out; Darcy vs Fanning | 30–50 % / 10–20 % |
| [3. NPSH for a hot liquid](#case-npsh) | vapour pressure at the wrong temperature | 30–50 % (margin, low level) |
| [4. Control valve on hot water](#case-valve) | choked and flashing flow ignored | 30–50 % |
| [5. Ethanol–water VLE](#case-vle) | Raoult's law misses the azeotrope | 15–30 % |
| [6. Dense-phase CO₂](#case-co2) | ideal gas or cubic EOS near the critical point | 30–50 % |
| [7. Shell-and-tube F factor](#case-hx) | LMTD without the 1-2 correction | 25–40 % |
| [8. Fire-case relief valve](#case-relief) | latent heat and Z at 1 atm | 30–50 % |
| [9. Semi-batch scale-up](#case-scaleup) | lab feed time kept at plant scale | 20–35 % |
| [10. Flash steam](#case-flash) | return line sized for liquid only | 25–40 % |

A second, related hypothesis came from the brief for the study: that recalled numbers, textbook conventions, codes
and citations would be weak points.

## 3. Method

**Phase 1: the ten problems as calculations** ([App](#case-compressor), [Code](#c-1)).
- Each problem is a Python model (`cases.py`) that runs in the browser through Pyodide. It computes the naive and the
  corrected answer over a range of inputs.
- Property data come from tables generated with CoolProp (reference equations of state); water vapour pressure
  uses IAPWS-IF97.
- Tests compare the models with independent methods: CoolProp, the `iapws` package, Swamee–Jain, the ε-NTU method
  and hand calculations. The in-browser results agree with CPython to 3e-16.
- An independent reviewer with a plant-engineer brief checked the formulas and the process sense.
- [The prompting guide](#p-1) collects prompts against each trap and against unknown unknowns.

**Phase 2: measuring instead of estimating** ([Measured](#m-1)).
- 25 questions in nine categories:
  - the ten traps;
  - recalled data (Antoine constants, critical constants, latent heat);
  - conventions (SCFM, Dittus–Boelter, Arrhenius, heat of reaction per mole);
  - immiscible liquids, hydrogen density, fluidization, stiff kinetics;
  - API 521, OSHA PSM, a citation, and one plant-floor diagnosis.
- Each question was worded as a user would ask it and sent to 5 fresh Opus 5.5 sessions, 125 runs in all.
- Each session had normal tools and its own empty folder, with no hint that it was a test. The repository's
  `CLAUDE.md` was loaded.
- Transcripts were checked: no run read this project or its published page.
- References were computed independently: CoolProp, IAPWS, scipy (Radau), Crossref and eCFR.
- Each question's five answers went to an independent Opus 5.5 grader, which also listed every checkable side
  statement that was false. I re-checked those side errors with my own code.

## 4. What happened

- **Phase 1.** The reviewer found no formula errors. It flagged a misleading regime label ("not choked" where
  cavitation was likely) and optimistic default inputs; both were fixed before publication.
- **Phase 2, running.** A usage limit stopped 20 of the 125 runs partway through. They were restarted fresh, not
  resumed, so every run started from the same state.
- **Phase 2, behaviour.** In [[m_tools]] of [[m_runs]] runs the model computed or looked up the answer rather than
  answering from memory. Runs answered from memory on [[mem_list]], and those answers were still correct.
- **Phase 2, a pattern.** The same false aside appeared independently in 3 of the 5 compressor runs: the
  gauge-pressure mistake was described as "433 K (160 °C)" when it is 433 °C (706 K).

## 5. Results

**Overall** (details in [Measured §2](#m-2)):

| | |
|---|---|
| Main answers correct | **[[m_correct]] of [[m_graded]]** (one question, the column diagnosis, not graded) |
| Main answers wrong | [[m_wrong]]; 95 % upper bound on the error rate about [[m_ub_all]] % (about [[m_ub_q]] % for any single question) |
| Runs with a false side statement | [[m_side_runs]] of [[m_runs]] ([[m_side_n]] statements) |

**The ten problems: hypothesis against measurement:**

| Problem | Self-estimate | Measured (5 fresh runs) |
|---|---|---|
| [1. Gauge vs absolute pressure](#case-compressor) · [answers](#mq-compressor) | 20–35 % wrong | [[mc_compressor]] |
| [2. Pipe pressure drop](#case-pipe) · [answers](#mq-pipe) | 30–50 % | [[mc_pipe]] |
| [3. NPSH for a hot liquid](#case-npsh) · [answers](#mq-npsh) | 30–50 % | [[mc_npsh]] |
| [4. Control valve on hot water](#case-valve) · [answers](#mq-valve) | 30–50 % | [[mc_valve]] |
| [5. Ethanol–water VLE](#case-vle) · [answers](#mq-vle) | 15–30 % | [[mc_vle]] |
| [6. Dense-phase CO₂](#case-co2) · [answers](#mq-co2) | 30–50 % | [[mc_co2]] |
| [7. Shell-and-tube F factor](#case-hx) · [answers](#mq-hx) | 25–40 % | [[mc_hx]] |
| [8. Fire-case relief valve](#case-relief) · [answers](#mq-relief) | 30–50 % | [[mc_relief]] |
| [9. Semi-batch scale-up](#case-scaleup) · [answers](#mq-scaleup) | 20–35 % | [[mc_scaleup]] |
| [10. Flash steam](#case-flash) · [answers](#mq-flash) | 25–40 % | [[mc_flash]] |

**The fifteen further questions** (recalled data, conventions, thermodynamics, correlations, numerics, codes and
citations; [Measured §3](#m-3)) were also answered correctly in every graded run. **Every false side statement found**
is listed in [Measured §2.2](#m-2-2).

## 6. Conclusions

1. **The hypothesis is rejected for this setting.** With tools available and a `CLAUDE.md` that asks for computed
   rather than recalled numbers, Opus 5.5 avoided every textbook trap tested, and usually said so explicitly. It
   converted gauge to absolute, checked for choked flow, applied F, and summed the vapour pressures of immiscible
   liquids.
2. **The observed failure mode is the unchecked aside.** Headline numbers were computed and right. Comparisons,
   "if you had done X" examples, and attributions (which equation of state, which data source) were sometimes stated
   without checking, and some were wrong. A reader who checks only the headline will not catch these. The prompt in
   [Measured §2.4](#m-2-4) targets them.
3. **What this does not show.**
   - The questions were mine, so they test traps I already knew. Finding the errors I do not know I make needs
     questions written by engineers with plant experience.
   - Every question was well posed. Ambiguous or incomplete questions, long multi-step tasks, and sessions without
     tools were not measured.
   - Charts, P&IDs, whole-flowsheet consistency and costing were not tested. For those, the App-tab write-ups remain
     unverified expectations.
4. **For users.** The prompting advice still applies ([Prompting guide](#p-2)): state the basis, ask for
   computed properties, ask for a second method. To it add: *check every number in the answer, including the asides*.
