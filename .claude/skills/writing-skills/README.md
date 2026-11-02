# Writing skills

## Contents

- `SKILL.md`: the core rules (rules 1–35), loaded for all writing under the package. It states which reference file loads under which condition.
- `references/`: `textbook.md` (detail sentences: derivations, definitions, procedure steps, worked calculations), `equations.md` (displayed equations), `figures.md` (figures, plots, and tables), `business.md` (business documents), `ste100.md` (the Simplified Technical English dial, on request only), `ai-check.md` (the revision pass, the AI-writing pattern list, and the independent check pass), and `evidence.md` (evidence, corpus sizes, and limits; not loaded for writing).
- `APPENDIX.md`: two chief executive officer letter patterns held out of the main rules because they rest on one corpus.

## Worked examples on the web

Paired samples, with and without the rules, are rendered on a published page with the differing forms highlighted and a difference line under each pair; each sample is labelled by its document type and by the files that type loads.

[Writing skill: paired samples](https://chetools.github.io/muse/writing-skill-paired-samples/)

## Use with an AI assistant

Install the folder as a skill (for Claude Code, `.claude/skills/writing-skills/`), or give the assistant `SKILL.md` as a standing instruction file, and name the document type in each request: a paper, a report, a tutorial, an executive summary, a recommendation memo. Ask for the revision pass in `references/ai-check.md` before delivery: "Revise this draft under writing-skills as a STEM report, and run the revision pass." For a document of consequence, ask a separate session, one that did not write the draft, to run the independent check pass against the source material, and adjudicate its findings before delivery.

## Use without an assistant

Draft first. Revise with the revision pass in `references/ai-check.md`, reading the rule each item cites.

## Scope

STEM denotes science, technology, engineering, and mathematics; SI denotes the International System of Units. The core governs all writing by default. `business.md` governs only when a business document is requested; in a mixed document, technical sections follow the core and non-technical sections follow `business.md`.

## Sharing

Copy and adapt the package freely. Keep `references/evidence.md` with it: the limits stated there are part of the rules, and a copy without them overstates what the rules rest on.
