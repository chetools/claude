# Blind validation

Question: does the derived guide move my writing closer to the style of the
held-out originals, and does it read better?

Material: 50 units from the held-out documents (14 papers, 4 company posts),
cut by `scripts/validation_units.py`: abstracts, introduction openings,
conclusion or discussion openings, sets of up to three figure captions, and
post openings. None of these documents was in any analysis bundle.

Steps:

1. Content sheets (Sonnet): for each unit, the facts, claims, numbers, terms
   and references it contains, as terse fragments in a fixed category order
   (context, problem, approach, results, implications, other), without the
   original wording or sentence order. Target length is given in words.
2. Drafts (Opus), two conditions from the same sheets:
   A, current rules only (`writing-style/writing-style.md`);
   B, current rules plus `guide/stem-paper-style.md`, the guide taking
   precedence where the two conflict.
3. Blind judging (Opus, a fresh agent per batch): for each unit, the original,
   draft A and draft B in random order under labels X, Y, Z. The judge
   (a) names the text most likely written by the original authors,
   (b) ranks the three by flow, detail and natural rhythm,
   (c) names, of the two texts it does not pick in (a), the one closer in
   style to the one it picks.
4. Measured features of A, B and the originals (`scripts/metrics.py`
   definitions), compared with the corpus medians and interquartile ranges.

Limitation: writers and judge are the same model family, so a judge may
prefer its own family's style. Step 4 is the check that does not depend on a
model's judgement.

The originals and the content sheets are deleted with the papers. Drafts,
verdicts and metrics are kept.
