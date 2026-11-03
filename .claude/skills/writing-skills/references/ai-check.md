# Revision and check pass [load at a revision or check pass]

## Revision pass

The writer revises the draft against these items, in order, before delivery:

1. Loading: the document type is named, and exactly the references whose conditions hold were loaded (core, Use).
2. Fidelity: no added fact, consequence, or causal link; derived figures marked as derived; every source fact the brief requires is included (core rules 3, 26).
3. Notation: symbols, abbreviations, and terms defined at first use; standard notation left undefined; one name per object (core rules 4, 10, 28); every term the field's own (core rule 2).
4. Sentences: first words listed, within the passage and across peer items (rule 11); lengths and structures varied (rule 12); no inference marker in a frame sentence (rule 14); no meta-signpost or empty restatement (rule 15).
5. Claims and limits: limits inside claim sentences, numbers bundled, nulls as detection statements, limit and inclusion wording (rules 25–27, 32); units and number typography (rule 33).
6. Document type: the completion check of the core and of each loaded reference. Content is ordered by reader importance, with implementation detail last, and no passage points out compliance (core rule 6).
7. AI-writing patterns and the house word list, below, scanned for clusters; each finding is checked against the examples in `examples.md`.
8. Mechanical scan: where the draft is a file, `tools/lint_prose.py` is run on it, and each flag is resolved or kept with a reason. The script flags candidates, not defects (density rule below).
9. Second pass, on the revision: (a) survivor scan — search the revised draft again for negative parallelisms, one-line closers, lists of three, dense em dashes, and mechanical boldface or "**Term:**" lists; (b) fidelity diff — repeat step 2 on the revision, claim by claim; merging a list of three, cutting qualifiers, and turning a labelled list into prose are the edits most likely to drop a claim; (c) restate the point instead of patching a flagged phrase; where a sentence stays awkward, rewrite its paragraph around its main point.
10. Remove-10% pass: any sentence, clause, or element whose removal loses no information is cut.

## AI-writing patterns

Source: Wikipedia, "Signs of AI writing", a WikiProject AI Cleanup advice page; the page is descriptive. The fault is density and formula: one listed word, correct grammar, a formal register, or one transition word is not a defect.

Strength: a staging pattern justifies a correction on one sighting. A weak-alone pattern — dense em dashes, stacked qualifiers, a hyphenated pair after the noun it modifies, passive voice with no actor named, one statement about the document itself — is a finding only in a cluster, under the density rule above.

- Content: importance inflated with claims of significance, legacy, or broader trends ("stands as a testament", "pivotal moment", "reflects broader", "setting the stage for", "evolving landscape") unless sourced and itself the subject; a trailing participle clause of vague analysis ("highlighting", "underscoring", "ensuring", "reflecting", "contributing to", "fostering"); promotional wording ("boasts", "vibrant", "groundbreaking", "renowned", "nestled", "in the heart of", "commitment to"); vague attribution ("experts argue", "industry reports"); the closing "Despite its …, it faces challenges …"; an unsourced "Future outlook" section; a heading repeated in the first sentence after the heading.
- Words: a high density of "additionally" as an opener, "align with", "bolstered", "crucial", "delve", "emphasizing", "enduring", "enhance", "fostering", "garner", "highlight", "interplay", "intricate", "key" as an adjective, "landscape" or "tapestry" as abstract nouns, "meticulous", "pivotal", "robust", "showcase", "testament", "underscore", "valuable", "vibrant"; "utilized" for "used", "authored" for "wrote", "attempted" for "tried".
- Sentence form: "serves as", "stands as", "marks", "represents", "boasts", "features", "offers" in place of "is", "are", "has"; a relation hidden in "in connection with" or "associated with"; stock negative parallelisms ("not just X, but Y"; "not X, it is Y"; "X rather than Y"); lists of three used to sound complete; one-line closers and dramatic fragments, including the same closer after several sections and a sentence after an example that names what the example showed; stacked qualifiers beyond the uncertainty the source supports (a qualifier that states scope, a condition, or real uncertainty is kept); a hyphenated pair kept after the noun it modifies ("the report is high-quality"), the hyphen being kept before the noun.
- Filler and framing: "it is important to note", "worth noting", "in summary", "in conclusion", "overall" restatements; chat filler in documents ("Certainly", "I hope this helps"); canned revision assurances ("improved clarity and flow") in place of the actual change; "while specific details are limited", "based on available information", knowledge-cutoff disclaimers, or speculation where information was not found.
- Format: mechanical boldface; a "**Term:** description" list as the default form; emoji in headings or bullets; a thematic break between every section; title case by default; dense em dashes; placeholder or template text.
- Framing and staging, in clusters: counted or slogan headings; manufactured counts of lessons or facts; compression claims ("fits in one sentence"); branded names for plain procedures; one figurative verb reused for unrelated results ("buys", "prices", "purchased") where a precise verb exists; exposition staged as questions, meta-headings ("What the bound says"), tour-guide transitions, next-chapter promises, or importance announced before its calculation.
- Staged correction and overreach, in clusters: corrective antithesis as the default form; a misconception or objection raised only to be rebutted; an inflated scope disclaimer; mirror symmetry that drops a qualification; agency verbs for estimators or directions ("decides", "prefers"); "honest" for the statistical property meant; a caveat or recap repeated with no added scope, condition, or limit; a specific result restated as a general lesson.

The last two bullets are editorial, not Wikipedia; the density rule above governs them.

## House word list

These uses are findings on one sighting, in any text.

- "Carry" states physical transport (a stream carries a solute), and "carry out" states a procedure. Neither stands for include, present, or account for ("the equation does not carry a term", "route B carries the lower cost"): the equation "has no" term, and route B "has" the lower cost. A comparison result takes "is" or "has" with its comparator; a figure's basis "is computed on that basis".
- "Scope", "basis", and "extent" are never the subject or frame of a limit statement ("Scope ends at …", "Basis of the comparison was …"). The limited thing is the subject (core rule 32). "Scope" appears only as a defined project term in object position.

## Independent check pass

A document of consequence is checked by a checker that did not write it: a separate session, a subagent, or a human reviewer. The checker's context holds the frozen source material, the draft, and this package, never the writer's reasoning or earlier drafts. The checker returns findings and does not edit the draft. Each finding quotes the sentence, names the head below that it fails, gives the evidence (the source passage or the recomputation), and proposes a correction. The writer or the user adjudicates each finding against the primary source before any correction is applied. For a long or high-stakes document, two checkers with disjoint scopes replace one checker with the full list. A completed check is an exhausted findings list, not a certification: agreement between writer and checker does not verify a fact against its primary source.

Boundary with page and notebook verification: this pass governs prose. A page, app, or notebook, and a document with computed examples or figures, is also verified under the repository's own verification rules (its `CLAUDE.md`). Where both apply (for example the Theory prose of a page), one independent review serves both: the reviewer runs heads C1, C3, and C6 on the prose together with the repository's verification, and no second check pass is run for the same delivery.

Heads:

C1. Traceability: every fact, figure, and consequence in the draft is stated in the source material (an addition is a finding); every source fact the brief requires is included (a silent omission is a finding).
C2. Recomputation: each derived figure, worked example, and unit conversion is recomputed from the stated inputs; a figure only checked for plausibility is a finding.
C3. Literal truth: each sentence is read as a literal claim. A goal is stated as a task, not as its answer; a validity statement names the law or model as subject; a definition states what the term denotes. Right facts in a form that misstates the claim are a finding.
C4. Cross-part agreement: text against tables, figures, captions, abstract, and conclusion, and every claim about the document (a summary, a covering note) against the document.
C5. Completeness against the brief: each element the document type requires (a recommendation, an owner, an evidence base, limits, a stated outcome) is present, and each promised item is delivered.
C6. Notation (core rules 4, 10, 28, 33): symbols defined before first use, one name per referent, abbreviations expanded at first use, one unit form per quantity. A definition spent on standard notation, a statement that a requirement has been met (core rule 6), and a coined term or a term the field does not use in that sense are findings.
C7. Citations (core rule 35): each in-text citation resolves to exactly one bibliography entry, each entry is cited, entry data match the publisher record or Crossref, and book citations give pages.
C8. Regression: after corrections, the corrected passages are checked again under C1–C7; a correction that drops source content, changes a stated count, or adds an unsourced claim is a finding.
