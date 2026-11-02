---
name: writing-skills
description: Writing rules for scientific, engineering, instructional and business text in English (papers, reports, tutorials, theory text on pages, notebook prose, captions, memos, executive summaries, slide storylines, commit messages), measured from highly cited Nature and Science papers, AI-lab instructional writing, chemical-engineering textbooks and consulting documents. Load before drafting or revising such text, and at a check pass.
---

# Writing skills

## Use

This core governs all writing under the package. A reference file is loaded only when its condition holds, and a loaded reference governs its stated scope over the core.

- `references/textbook.md`: detail sentences (a derivation, definition, assumption, procedure step, caveat, or worked calculation).
- `references/equations.md`: a document with displayed equations; `textbook.md` is loaded with it.
- `references/figures.md`: a document with figures, plots, or tables.
- `references/business.md`: a business document (recommendation memo or report, executive summary, slide storyline).
- `references/ste100.md`: only when a percentage of technical style, or STE100, is requested.
- `references/ai-check.md`: a revision or check pass.

`references/evidence.md` holds the evidence and limits of every rule and is not loaded for writing.

Precedence, highest first: an explicit instruction for the piece; the author guidelines of the target journal or publisher, for work prepared for them; this package.

## Register and audience

1. Register: journal-formal, unemotional, impersonal. In STEM and instructional writing the text explains and does not persuade: no argumentative framing and no rhetorical connectives ("the decisive point is"). Business documents follow the persuasion screen in `business.md` instead. No hype, no clickbait title, no conversational fragment as a heading, no anthropomorphizing, and no second-person aside outside tutorials (rule 23).
2. Words: plain words, and the most specific word that fits the observation: a reduction where a procedure produced the change, a decrease where a recorded value went down, never a figurative "fall". A technical word the reader may not know is explained in plain language at first use. Brevity comes from cutting words and clauses, never qualifications, ranges, or evidence.
3. Source fidelity: no fact, consequence, or causal link is stated that the source material does not state. A derived figure is stated as derived, with its derivation. Verified fact is kept apart from inference, and what was not verified is said in place of speculation.
4. Notation: every mathematical symbol is defined at or before first use, with SI units where a unit applies, and every abbreviation is expanded at first use, a letter abbreviation for a compound or mixture (MEA) included. The STEM and textbook audience is chemical engineers, so standard notation takes no definition: element symbols (H, N), formulae of common species (NH3, CO2), and SI unit symbols stand without a "denotes" clause, an expansion, or a roster entry.
5. Depth: an explanation is written to full operational depth for a reader with a bachelor degree in engineering. Every derivation step is shown with its physical meaning. A computed quantity is defined by what is computed, from what data, and in what steps; "normalised" is stated as divided by exactly what. A document derives only what it computes.

## Document structure

6. A document opens with its title and then its content. No passage states who prepared or requested it, why, its status, or its distribution; no passage carries prompt framing ("as requested"), engineering caveats, or fallback commentary; no heading or note calls out extra effort. These belong in the covering message.
7. Headings are nominal, impersonal, short, and state the content, in sentence case unless the target style differs; at most three heading levels. Prose is the default form: bullets for genuinely parallel items, tables for comparisons across shared attributes, and no small table where prose is clearer. A document with more than about 10 symbols adds a nomenclature table, and still defines each symbol in place.

## Sentences and paragraphs

8. A sentence opens with the noun it is about. A participle frame ("Using …") is a minority opening, and "we" is used sparingly.
9. Explicit connectives are sparse and spent on contrast; "However" is the default marked transition. Addition and sequence stay unmarked unless the relation would otherwise be missed.
10. One object keeps one name and one reference form ("this skill" stays "this skill"); continuity comes from repeating the term, with no synonym cycling and no signpost chains. A sentence that must stand on its own (a validity statement, a closing, the first sentence of a section or paragraph) restates the object's name, not a bare category noun: "Fick's law holds for a stagnant medium", not "The law holds…". Closeness, not repetition, is the constraint; occurrences far apart take the full name.
11. Sentence openings vary. Sentences in a passage do not open with the same word, "The" least of all, except as deliberate emphasis, and "The" opens a sentence only where no better opening serves. Peer items of one type (five tutorials, a set of abstracts) do not open with the same word or phrase. The check lists the first word of each sentence, within each item and across peer items.
12. Phrase and sentence lengths vary; a paragraph mixes short and long sentences and closes on shorter sentences than it develops with. A results passage is not fragmented into single-datum sentences. Constructions and paragraph shapes vary where a varied form costs nothing; variety never costs a definition in place, a bundled number, a named owner, or claim strength.
13. Data values stand in parentheses inside the sentence, not in a clause of their own.
14. A frame sentence (a closing or finding sentence that rests a claim or a decision on grounds stated before it) does not mark its inference with "thus", "therefore", "hence", "accordingly", or a causal "so". Derivation steps in detail sentences are marked (`textbook.md`).
15. No meta-signpost announces the text's own moves; the interpretation, the example, or the limit is stated. A result is restated only where the restatement adds scope, a condition, or a limit.

## STEM structure

16. Opening order: setting, established knowledge, gap (stated as missing knowledge where that is the case), aim, method preview.
17. Abstract order: setting, aim or approach, method, principal result (qualitative, then quantitative), interpretation, implication. No limitation stands in the abstract; limitations go in the closing.
18. Interpretation stands next to the result it interprets. A results sentence carries a number by default.
19. Figures are referred to in the order the results need them.
20. The closing claim is held at or below the abstract claim, and is raised only where the closing combines evidence strands explicitly. The closing states the principal claim at its tested scope with the limitations named, and restates content (the claim, the relation, the finding), not the document's moves. A closing that states a limitation alone is used only where no scoped claim is available.

## Instructional text

21. A tutorial states its goal in its opening sentences and its outcome, with values, near the start.
22. A worked example has inputs, a result, and what the result shows or how it is checked.
23. A tutorial addresses the reader; an explainer does not. Audience and prerequisites are stated where the item assumes them.
24. Checkpoints, expected outputs, and warnings stand at the point of risk. A code block is preceded by a purpose sentence and followed by a statement of the output.

## Claims, numbers, and definitions

25. The limit stands inside the claim sentence, before the number it qualifies: a concession clause first with the bounded claim as main clause, or the exception, condition, or scope in the same sentence.
26. A number is bundled in its sentence with its qualifier: denominator or cohort, interval, and named baseline or contrast, in parentheses where the syntax requires. A denominator is fixed in the sentence that defines the quantity. A scored or predicted result carries its baseline's name and the baseline's value at the scored point.
27. A null result is a detection statement: what was not detected, under what conditions, over what range, or against which reference; never an absence.
28. A term is defined in place at its first dependent use: a parenthetical or appositive definition, an operational definition attached to the first reported value, or a henceforth sentence fixing a short name. A composite notation is defined symbol by symbol, in symbol order. A quantity named as a model output or part of a result (a prediction and its uncertainty) is a term under this rule.
29. A choice or threshold is keyed to its condition in a condition-first sentence.
30. A confirmation names the independent route: the second device, technique, phenomenon, or laboratory.
31. An analogy or simplification is followed, within that sentence or the next, by where it stops holding.
32. Limit and inclusion wording, in any text:
    - Validity: the law, equation, relation, model, or criterion is the subject of "applies (only) to", "is valid for", "holds for", or "is limited to", with the condition in the same sentence and the case outside stated as what changes (a moving medium adds a convection term). A result or reported figure is never the subject of "holds"; it "is valid at" a point or "for" a range.
    - Omission: the omitted term or effect is named, as the subject of "can be neglected" or "is neglected", the object of "neglect" or "omit", or with "is not included in" a named model, and the reason stands in the same or the next sentence.
    - Closing limit: the conditions are restated, or the limited thing is the subject of "is limited to". "Scope", "basis", and "extent" are never the subject or frame of a limit statement ("Scope ends at …", "Basis of the comparison was …"); "scope" appears only as a defined project term in object position.
    - "Carry" states physical transport (a stream carries a solute) or "carry out" a procedure, never include, present, or account for ("the equation does not carry a term", "route B carries the lower cost"). A comparison result takes "is" or "has" with its comparator; a figure's basis "is computed on that basis".
33. Numbers and units: an en dash for a range (10–20 m), a true minus sign (−3), the multiplication sign (×), and a non-breaking thin space between number and unit (5 m/s). SI usage follows ISO 80000 and NIST SP 811. Significant figures are consistent, and each quantity keeps one unit form.

## Captions and citations

34. A caption is a noun phrase followed by conditions and sample size, and states the finding when the figure carries the claim; "Fig. N | Takeaway sentence." is used where a house or journal style requires it. The caption fixes what the text leaves open: method, threshold, baseline, error-bar provenance, replication count, conditions, spread, or the computation behind the plotted quantity. A trend sentence in the text carries its values. Figure rules: `figures.md`.
35. Every modelling or algorithmic choice is cited. Every in-text citation resolves to exactly one bibliography entry, every entry is cited, and entry data (authors, year, title, venue, volume and pages, or DOI) are checked against the publisher record or Crossref. A book citation gives page numbers.

## AI-writing patterns

Drafts avoid clusters of the patterns listed in `references/ai-check.md`: inflated importance, trailing participle analysis, promotional wording, vague attribution, the overused word set, copula avoidance, stock negative parallelisms, decorative lists of three, filler and canned framing, mechanical boldface, default "**Term:**" lists, emoji, dense em dashes, and placeholder text. One listed item is not a defect; density is.

## Completion check

A document is complete when: abbreviations are expanded (rule 4); no fact is added and every source fact the brief requires is carried (rule 3); scored results carry their baseline (rule 26); a tutorial opening states its outcome with values (rule 21); the closing restates content (rule 20); citations resolve (rule 35); and the completion check of each loaded reference passes. A document of consequence also gets the independent check pass in `references/ai-check.md`, run by a checker that did not write it.
