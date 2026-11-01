# Body sections, part 2: style analysis

## Scope and method

The bundle holds 44 documents: 6 astrophysics, 6 computer science and EESS (other), 7 condensed matter, 7 machine learning, 6 mathematics and statistics, 7 physics (other) and 5 quantitative biology. Each excerpt stops at about 1,500 words. 31 documents are body sections with topical headings. The other 13 are letter-style or full-text extracts that start with the title, authors and abstract and have no internal headings in the excerpt (0711.0156, cond-mat/0410550, cond-mat/0509355, 0806.1256, 1710.05832, 2003.06557, physics/0602124, 1312.3926, 1509.01845, 2012.10295, q-bio/0410037, 1002.4734, math/0608017).

All 44 were read in full. Counts marked "counted" come from that reading or from a regular-expression pass over the bundle text (word lists for "we", hedges, sentence openers, "where"-clauses after equations, and similar). Statements marked "impression" were not counted. Medians for the whole corpus come from the `paper,body` row of `metrics_summary.csv` (n = 35 units). That row covers all three thirds of the corpus, not only this one. Equations are replaced by `[MATH]`, so symbol definitions and units could not be checked against the equations themselves. 6 documents keep their paragraph breaks; the other 38 are flattened, so paragraph length was measured on those 6 only.

## 1. Structure

Counted. The 44 documents fall into five section types. Each has its own sequence of moves.

Method or model derivation (10: astro-ph/0505010, 1506.08498, cond-mat/0106096, 1111.4246, hep-ph/0603175, 1207.3907, 1502.03167, 0711.0156, math/0307152, math/0410542). The sequence is: state the object or problem, write the governing equation, define its symbols, then take each consequence in turn. Each consequence is a limit, a special case, a cost or a condition for validity. In 8 of the 10, the section ends on a remaining difficulty that the next section takes up (all except the two proof sections).

Design by failure and repair (counted in 12 of 44: 1502.03167, 1608.04644, 1111.4246, physics/0602124, 1409.4842, 1506.02640, hep-ph/0603175, 2003.06557, 1009.1622, 1403.6652, 0711.0156, cond-mat/0106096). This is the most common way the bundle explains a mechanism. The text proposes the obvious approach and shows how it fails, often with a small worked case. It then gives the change that removes the failure and states what the change costs. The failure always comes before the fix.

> Constructed example: The simplest controller switches the heater fully on below the set point and fully off above it. With a thermal lag of 40 s, the reactor temperature then oscillates by about 3 K around the set point. Adding a 1 K dead band removes the oscillation, at the price of a steady offset of up to 0.5 K.

Measurement and result (12: 0803.0547, 1509.06555, 0803.4060, 1506.08498, cond-mat/0410550, cond-mat/0509355, 0806.1256, 1710.05832, 2103.00020, 1004.4170, 1102.1523, 1512.03012). The sequence is: what was computed and from which data, a pointer to the figure, what the figure shows, the number, the comparison, and then the interpretation. 11 of the 12 keep this order. In 1004.4170 the interpretation comes without a number in the text.

Related work (6: 1610.06475, 2212.04356, 1405.0312, 1409.4842, 1608.06993, 1403.6652). In 5 of the 6, each prior method gets its own paragraph or run-in heading. The text says what the method does and where it stops working, then ends the paragraph with how the present work differs. 2212.04356 lists the lineage and does not contrast it with the present work.

Software or system catalogue (7: 1009.1622, 1307.6212, 1102.1523, 0906.2569, 0710.3820, 2012.10295, 1509.01845). The sequence is: what each component does, why it was built that way, and a usage example. The "why" sentence is missing for most components in 2012.10295 and 0906.2569.

Letters. Counted. In 11 of the 13, a gap sentence ("remains limited", "is not clear", "has not been reported") comes before the contribution. 1710.05832 and 2012.10295 are a discovery chronology and a status report, so they have no gap. A contribution sentence appears in all 13. In 6 it opens with "Here we" (cond-mat/0410550, cond-mat/0509355, 0806.1256, 2003.06557, physics/0602124, q-bio/0410037). The others use "In the present work", "In response, we", "I present" or "In this article". After the contribution, the letters give a short method description and then results, each followed by its inference.

Length. Counted on the 6 documents with paragraph breaks: median paragraph length is 62–102 words (1706.03762 62, 1512.03012 71, 1004.4170 73, astro-ph/0006289 90, 1509.06555 102). 0803.4060 has a median of 221 words, because subsections were merged. The corpus median for body units is 129 words per paragraph (interquartile range 95–204). Section signposts ("In this section we...") open 12 of the 44 excerpts (for example 1307.6212, 1509.06555, 0803.4060, 2103.00020, 1207.3907).

## 2. Paragraphs

Opening. Impression, checked on the 6 documents with breaks and on the run-in headings. A paragraph opens with a topic sentence. That sentence names the object of the paragraph and usually its role, for example "The X module provides..." or "Sum-squared error also weights...". Run-in headings in bold or italic stand in for the topic sentence in 5 documents (1608.06993, 1706.03762, 1405.0312, 2212.04356, 1512.03012).

Development. Three kinds recur.
- Equation, then a "where" clause, then the physical meaning (counted in 24 of 44, for example astro-ph/0505010, 1506.08498, 1111.4246, 1608.06993, cond-mat/0509355).
- Claim, then reason, then consequence, joined by "since", "thus" and "therefore" (for example 0711.0156, cond-mat/0106096, 1502.03167).
- A set of parallel cases, one sentence each, often as "If ... too large ... If ... too small ..." (counted in 1111.4246, hep-ph/0603175, cond-mat/0106096, 0806.1256).

> Constructed example: If the time step is too large, the explicit scheme becomes unstable. If it is too small, most of the run is spent on steps that change nothing. If the step varies with the local diffusivity, both problems disappear, but the scheme loses second-order accuracy.

Closing. Impression. Paragraphs in derivations close on a consequence, a limitation, or a pointer forward ("This is discussed in Section..."). In results paragraphs the last sentence is the interpretation or the comparison with earlier work (0803.0547, 0803.4060, 1710.05832). Closing summaries that restate the paragraph are rare. Of the 44 documents, only 1207.3907 opens a closing sentence with "In summary".

Hand-over. Impression. The last noun phrase of one paragraph often becomes the subject of the next ("...the leakage" → "This leakage..."). Explicit bridges such as "Having chosen X, we now need Y" occur in 1403.6652, 1111.4246, hep-ph/0603175 and math/0307152.

## 3. Sentences

Length and rhythm. Corpus medians for body units: 22.8 words per sentence (interquartile range 21.4–24.8), standard deviation 13.8, coefficient of variation 0.63. 8.5 % of sentences have more than 40 words. The crude per-document estimate on this bundle runs from about 18 words (1506.02640, 1608.06993, 1405.0312) to about 37 (1207.3907; 2003.06557 is distorted by OCR). Impression: long sentences that define a symbol or set out a condition alternate with short sentences that state the result. Short sentences of four to eight words carry a verdict in 0711.0156, cond-mat/0410550, 1710.05832, 1509.01845 and physics/0602124.

> Constructed example: The packed-bed model assumes plug flow, a uniform void fraction and negligible axial dispersion, which holds when the bed is at least 50 particle diameters long. Here it is 30. Axial dispersion is therefore kept.

Information flow. Impression, checked in physics/0602124, 1111.4246, 1502.03167 and 0806.1256. The subject is a term the reader already has: the method's name, a symbol defined just before, or "this" with a noun. The end of the sentence carries the new item: a number, a condition, or a newly named term.

"We" and voice. Counted. "We/our/us" appears at least once in 42 of 44 documents. 2212.04356 and 1207.7235 have none. 14 documents use it 20 times or more in about 1,500 words: 0803.0547, 1509.06555, 1403.6652, 1512.03012, 1608.04644, 0803.4060, cond-mat/0106096, 1502.03167, 1506.02640, 1608.06993, 1004.4170, math/0307152, math/0410542 and 1207.3907. 12 documents use it 4 times or fewer. These are the software manuals, collaboration papers and review-style texts (1307.6212, 0906.2569, 1506.08498, 1207.7235, 1312.3926, math/0608017, 2012.10295, 0710.3820, 2003.06557, 1710.05832, 1509.01845, 2212.04356). The corpus median is 7.7 occurrences per 1,000 words, and 26 % of sentences contain a passive. Impression of the division of labour:
- "We" goes with choices and actions: we choose, fix, set, assume, find.
- The passive goes with established procedure and instrument description: is reconstructed, is required to be, are taken from.

1207.7235 is almost entirely passive. In 1506.02640 nearly every sentence is a "we" or "our network" action. Mathematics uses "we" inside proofs (math/0307152: 39 occurrences) and "one" for general statements (math/0410542: 3, 2003.06557: 3).

Openers. Counted. At least 40 of 44 documents open sentences with "We". Imperative or hypothetical openers ("Consider", "Suppose", "Let", "Assume", "Let us") occur in 16 documents: 4 of the 6 mathematics documents (1002.4734, math/0307152, math/0410542, math/0608017) and derivation texts such as 1102.1523, 1502.03167, physics/0602124 and hep-ph/0603175. Rhetorical questions occur in only 2 documents (0803.0547, cond-mat/0106096). In both they set out the questions that the section then answers.

## 4. Claims and evidence

Numbers. Counted.
- 15 of 44 state a result next to an explicit baseline: earlier limits, another method, experiment, or a reference simulation (0803.0547, 1102.1523, 0803.4060, 1506.08498, 1506.02640, 1608.04644, 1004.4170, 2103.00020, physics/0602124, cond-mat/0410550, cond-mat/0509355, 1710.05832, q-bio/0410037, 1207.7235, 1509.06555).
- 9 of 44 give an uncertainty with the number: confidence or credible level, significance in σ, ± range, or a confidence interval (0803.0547, 1509.06555, astro-ph/0006289, 2103.00020, 1710.05832, cond-mat/0509355, 1207.7235, 1004.4170, 1312.3926). All 9 are in astrophysics, physics, quantitative biology, and the bias analysis of 2103.00020.
- The machine learning and software sections report point values without spread: a run time, an accuracy, a speed-up factor (1102.1523, 1506.02640, 1706.03762, 1409.4842).
- Units sit next to the number wherever the extraction kept them (0803.4060, cond-mat/0410550, 1710.05832, 1312.3926).
- Agreement is phrased as "consistent with" or "in agreement with" in 17 documents.

> Constructed example: The fitted heat-transfer coefficient is 410 ± 30 W/(m² K) (95 % confidence), 12 % above the Dittus–Boelter value for the same Reynolds number.

Strength and hedges. The corpus median is 3.2 hedge words per 1,000 words. Counted per document (per about 1,500 words): 0 or 1 hedge word in 1009.1622, 1307.6212, 1509.06555, astro-ph/0006289, 0906.2569, math/0608017, 1207.7235 and 2212.04356; 10 or more in hep-ph/0603175 (19), 0806.1256 (15), physics/0602124 (11) and 1405.0312 (10). Impression of placement: measured values and proved statements go unhedged. Hedges sit on the step from data to mechanism or significance. cond-mat/0410550 shows the full sequence. It raises a possible cause with "could be due to", tests it by annealing, and then states the conclusion with "we believe". 1710.05832 marks the scope of a claim with "do not exclude". Proofs carry no hedges. Instead they state their conditions in "provided that" clauses (math/0307152, math/0410542).

Results verbs. Counted. "We find", "we observe" and "we obtain" occur in 16 documents. In 0806.1256 almost every result sentence ends with an inference clause ("indicating that...", "suggesting that..."), 6 times in the excerpt.

## 5. Terms and definitions

Counted.
- 21 documents introduce a name with an explicit naming construction: "we refer to X as", "which we call", "we define X as", "denoted", "henceforth referred to as". Examples are 1502.03167, 1608.06993 (6 instances), physics/0602124, cond-mat/0410550 and 1207.7235.
- In 4 documents (1502.03167, 1506.02640, q-bio/0410037, 1608.06993) the definition is the first sentence of the section or paragraph that uses the term.
- Acronyms are spelled out with the short form in parentheses at first use in 22 documents (for example 1009.1622, 0711.0156, cond-mat/0509355, 1710.05832, 1405.0312).

Impression: after a term is named, the bundle repeats the exact term and does not vary it. "Modularity" in physics/0602124, "growth rate" in 1608.06993 and "internal covariate shift" in 1502.03167 recur unchanged. Symbols are defined in a "where" clause right after the equation (24 documents, counted). The physical meaning of the defined quantity often follows in the next sentence ("This quantity is proportional to the progress..."). Units for defined symbols could not be audited because the equations are removed.

> Constructed example: We call the ratio of reaction rate to diffusion rate the Thiele modulus, φ. When φ exceeds about 3, the catalyst interior is starved of reactant.

## 6. Connectives and cohesion

Counted. Corpus medians: 8.3 % of sentences open with a connective from the metric's list, and 2.0 % open with a bare "This" or "These" followed by a verb. In the bundle, a bare "This" plus verb occurs at least once in 31 of 44 documents and three or more times in 9 (astro-ph/0505010, 1608.04644, 1610.06475, cond-mat/0106096, 1409.4842, 1502.03167, 1506.02640, 1111.4246, hep-ph/0603175). The commonest causal links are "thus", "therefore", "hence", "consequently" and "as a result". They are densest in 0711.0156, cond-mat/0106096, 1509.06555 and 0806.1256. Contrast links ("however", "but", "on the other hand", "in contrast") occur in 33 of 44, with the most in 0711.0156 (6). Explicit counting sequences ("First", "Second", "Finally") occur in 1403.6652 and math/0410542 (6 each) and in hep-ph/0603175 (3).

Impression: the main glue is a repeated noun or a defined symbol, not a connective. A typical paragraph in physics/0602124 or 1111.4246 has one or two explicit connectives. The other sentences are tied by restating the subject ("The modularity...", "The doubling..."). Restatements ("In other words", "That is") come right after a formal statement and give it in plain words (1102.1523, 1403.6652, cond-mat/0106096, 1111.4246, math/0410542).

## 7. Differences between groups

Counted where numbers are given; otherwise impression.
- Mathematics and statistics. Proofs (math/0307152, math/0410542) have the highest density of "we" and of "Consider/Let/Assume" openers. They run "Since..., it follows that..." chains and contain no numbers with units. The two Annals of Statistics papers (1002.4734, math/0608017) are impersonal, cite by author and year, and set out conditions in long sentences.
- Machine learning. These have the shortest sentences (estimates of about 18–20 words in 1506.02640, 1608.06993, 1405.0312) and the most sentences opening with "We". They also have run-in headings (1608.06993, 1706.03762) and design rationale in "We use X because..." form (1506.02640, 1409.4842). Results are point values.
- Astrophysics and large physics collaborations. These state uncertainties and confidence levels (0803.0547, 1509.06555, 1710.05832, 1207.7235). They use fixed "Methodology / Results" subsections (0803.0547, 1509.06555). 1207.7235 avoids "we" entirely.
- Condensed matter letters. They follow context, gap, "Here we", then evidence followed by inference (cond-mat/0410550, cond-mat/0509355, 0711.0156). They have the most evaluative adverbs (section 8).
- Software papers in any field (1009.1622, 1307.6212, 0906.2569, 0710.3820, 2012.10295, 1102.1523). The product or module is the grammatical subject. These papers have the most passives (0710.3820 and 1506.08498 lead the bundle). They also contain the only second-person passages (0710.3820: 13 uses of "you").
- Quantitative biology is mixed. It contains author-year citation clusters (1312.3926), first-person singular (1509.01845) and long derivation sentences (1207.3907).

## 8. Weak patterns

Counted unless marked.
- Evaluative or promotional adverbs and adjectives in 6 documents: 1004.4170 ("fascinating", "amazingly", "fantastic"), cond-mat/0410550, 0906.2569 ("of course" twice), 1307.6212, 1610.06475 and q-bio/0410037. The worst case, 1004.4170, also claims superiority without giving a number in the text.
- Vague attribution ("studies show", "many other works have shown") in 3 documents: 1004.4170 (3 times), 2212.04356 and 1512.03012.
- Catalogue prose that lists features or commands without saying why they exist, in 3 documents (2012.10295, 1009.1622 in its module list, 1307.6212).
- A bare "This" whose antecedent is a whole preceding argument, three or more times in 9 documents (listed in section 6). It is hardest to resolve in 1409.4842 (6) and cond-mat/0106096 (5).
- Stacked hedges on one inference in 2 documents: 0806.1256 ("may appear similar to"; "could impact") and 1409.4842 ("it seemed beneficial"; "might cover").
- Overlong sentences with nested conditions. Impression: 1002.4734, 1207.3907 and 0906.2569 (estimated mean of about 30 words or more).
- Spelling and grammar errors that slow reading in 4 documents (1004.4170, 1506.08498, 1610.06475, 1608.06993).
- Manual register inside a paper, with direct address and exclamations, in 0710.3820. Second person also appears in 2103.00020.

## 9. Comparison with the house rules

Rules that the strong texts follow (counted):
- Define symbols at or before first use (Section 5). 24 of 44 define symbols in a "where" clause right after the equation (astro-ph/0505010, 1506.08498, 1111.4246, 1608.06993, cond-mat/0509355).
- Abbreviation next to its full form. 22 of 44 do this at first use (0711.0156, 1710.05832, 1405.0312).
- Repeat the correct term. Impression; clearest in physics/0602124, 1608.06993 and 1502.03167.
- Quantitative wording with baselines (Sections 3 and 7). 15 of 44 give a comparison baseline, and 9 of 44 give an uncertainty.
- Define each computed quantity by what is computed, from what data and in what steps (Section 7). Impression; followed in 1509.06555 (Monte Carlo procedure), 0803.4060 (diffusion coefficient from mean square displacement over 100 ps), 1509.01845 (the test statistic procedure), 2103.00020 (the probe design) and 1207.7235 (missing transverse energy).
- Keep em dashes rare. 36 of 44 have none; extraction may have dropped some.
- Avoid closing summaries ("in summary" etc.). Only 1207.3907 uses "In summary".
- Refer to equations in the text (Section 9). At least 12 documents refer back to numbered equations, for example 1506.08498 (11 times), 0711.0156 and q-bio/0410037.

Rules that strong texts break:
- Negative parallelism (Section 4). 6 documents define a concept by contrast in "not X but Y" form (physics/0602124, 0803.0547, 1608.06993, 1409.4842, 1706.03762, 2103.00020). In physics/0602124 and 0803.0547 the contrast is the definition itself: a good division has fewer edges than expected, not merely few edges. A blanket ban would remove these definitions.
- Trailing participle clauses (Section 4). 18 documents have at least one. Most are mechanical consequences ("resulting in a cost that grows as N²"), not vague analysis. The vague kind occurs in 0806.1256 and cond-mat/0410550.
- Write to explain, not persuade (Section 2). 0711.0156 and physics/0602124 argue a position: no functional of this form can meet both conditions, and modularity maximisation is the preferred method. Both support the claim with a derivation or with cited comparisons. This is close to the rule's allowance for an opinion stated with its evidence, but the register is argumentative.
- No second-person asides (Section 2). Broken by 0710.3820 and 2103.00020.
- A citation for every modelling choice (Section 8). Followed in 1509.06555, 1207.7235 and 0803.0547. Broken in 1004.4170, where parameters are justified by "we found... sufficient", and in 1409.4842, where a choice is justified by "for technical reasons".
- Rhetorical connectives (Section 2). Used sparingly: "Fortunately", "Unfortunately", "Worse", "Crucially" and "Most important, however" occur once or twice each in 10 documents (astro-ph/0505010, 1111.4246, physics/0602124, cond-mat/0509355, 1004.4170, 0906.2569, cond-mat/0410550, 2103.00020, math/0307152, math/0410542). In 1111.4246 and physics/0602124 each marks a real turn in the argument (a failed approach, a cost). There they read as signposts, not persuasion.

Not checkable from the bundle: units on every symbol, numbering of every equation, and the factual accuracy of citations, because equations and references were removed.
