# Writing style of highly cited STEM papers

Goal: a style guide for abstracts, introductions, methods, results, discussions,
conclusions and figure captions, derived from highly cited STEM papers with
arXiv versions, and checked by a blind comparison on held-out papers.

Success criterion: in the blind test on held-out papers, sections written with
the new guide are ranked closer to the original authors' text than sections
written under the current `writing-style/writing-style.md`, and their measured
features (sentence-length mean and spread, passive share, connective and hedge
rates) fall closer to the corpus distributions.

## Steps

1. Selection: `scripts/select.py` queries the Semantic Scholar bulk search for
   the most cited papers with an arXiv ID, per field of study. Output
   `data/selection.csv`, with a held-out set for validation.
2. Download: `scripts/fetch.py` gets the arXiv e-print (LaTeX source, latest
   version). `scripts/split.py` writes sections to `data/sections/`.
   Full texts are not committed (`data/raw/` and `data/sections/` are gitignored);
   only IDs, metrics and short quoted excerpts are kept.
3. Metrics: `scripts/metrics.py` (spaCy) per section type and field.
4. Analysis: one Opus 5.5 agent per section type, `analysis/<section>.md`.
5. Guide: `guide/stem-paper-style.md`, with a list of conflicts with
   `writing-style/writing-style.md`. Merging into that file needs approval.
6. Validation: `validation/`.

## Decisions (defaults used)

- Fields: all STEM fields of study in Semantic Scholar, stratified.
- Selection by citation count only, no quality screen.
- The guide is proposed for papers; precedence over the current rules is the
  user's decision.
- Papers from 2000 on. The API refuses an empty query with more than 1e7 hits,
  so each field is queried in year windows and the results merged.
- Second genre: instructional and descriptive writing (tutorials, docs,
  research and engineering blog posts) from Anthropic, OpenAI, Google and
  Google DeepMind, about 12 pieces each, analysed as a separate genre
  (user instruction).
- Papers are deleted after analysis and validation (user instruction). The
  guide keeps patterns, paper IDs and constructed examples, no verbatim text.
