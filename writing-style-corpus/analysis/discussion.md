# Discussion sections of highly cited STEM papers

Corpus read: 31 sections from the discussion bundle (30 headed "Discussion" or a variant, one "Results and Discussions", 1303.3997). Groups: astrophysics 5, computer science and EESS (other) 6, machine learning 4, mathematics and statistics 9, quantitative biology 7. Two blocks are atypical and are counted but treated with care: 1403.6652 is an unfinished draft (headings with editor notes and almost no prose), and 0803.2392 is a single flattened paragraph that is also a related-work survey. Two astrophysics blocks (astro-ph/0006053, astro-ph/0006289) and 1202.3665 carry acknowledgments and reference lists after the discussion; word counts below exclude them unless stated.

Measured values are quoted from the `paper,discussion` row of `metrics_summary.csv` (n = 30, median [interquartile range]). Counts "in k of 31" come from reading every block; phrase counts come from a regular-expression pass over each block. Statements marked "impression" were not counted.

## 1. Structure

Measured length: 532 words [428, 882], 22.5 sentences [16.5, 37.5], mean paragraph 89.7 words [69.8, 115]. Read counts give a median of 5 prose paragraphs (range 1–14). Discussions are about the length of a short introduction and less than half a results section (results median 1410 words).

The usual sequence of moves is:

1. Recap of the contribution, in the present perfect or simple past with "we" or "this paper" as subject. 17 of 31 open this way (0805.4471, 1111.4246, 1206.2332, 1203.6372, astro-ph/0006053). Six more open with a one-sentence roadmap of the section itself (2304.03442, 2212.04356, 0803.2392, math/0409186, 2103.00020, astro-ph/0009005). Eight go straight into substance with no recap (astro-ph/0006289, math/0410542, math/0502327, 1608.06993, 1303.3997).
2. Interpretation or mechanism: why the method works or why the observed relation holds. 11 of 31 (astro-ph/0006053, 1608.06993, 1708.01492, 1303.3997, q-bio/0512013).
3. Comparison with prior work or a named baseline. 17 of 31 (astro-ph/0006289, math/0410542, 1609.02907, 1305.3347, 1111.4246).
4. Limitations or failure cases. 16 of 31 (2103.00020, 1206.2332, 1507.04544, 1609.02907, 1202.3665).
5. Future work, open questions, or extensions. 22 of 31 (0805.4471, 2212.04356, 0810.3286, math/0502327, 1111.4246).

The final paragraph points forward (future work, an open question, a promised follow-up paper) in 18 of 31 (0805.4471, 0912.3599, 1206.2332, math/0503066, astro-ph/0006289). In 13 it closes on a value statement or a final interpretive claim instead (1111.4246, 1305.3347, 1708.01492, 1203.6372, q-bio/0512013).

Internal organisation: 10 of 31 use numbered subsections inside the discussion (0805.4471, 1609.02907, math/0409186, math/0410542, astro-ph/0009005); 6 use run-in paragraph labels such as a short noun phrase before the first sentence (1512.03012, 2212.04356, 1608.06993, 1206.2332, 1609.02907); the remaining 15 are continuous prose. Run-in labels coincide with a list of limitations or future directions in 5 of the 6.

Constructed example (recap move): We have presented a shell-side model for baffled heat exchangers that predicts the outlet temperature to within 2 K over the tested range, and we have shown that the leakage streams account for most of the departure from the ideal crossflow result.

## 2. Paragraphs

Opening. A paragraph opens with a topic sentence that names its subject as a noun phrase already known to the reader: the method name, "the model", "the correlation", "another limitation". Counted: in 24 of 31 blocks the first sentence of most paragraphs carries the paragraph topic in its grammatical subject (1111.4246, 2103.00020, 1708.01492, 1206.2332, math/0502327). Ordinal or "another" openers mark items in a series of limitations or extensions in 14 of 31 (1202.3665, 2304.03442, 1206.2332, 1111.4246, 0805.4471).

Development. The common internal pattern is claim, then reason or example, then qualification. "For example" or "for instance" introduces a worked case in 15 of 31 (1507.04544, 0805.4471, 2304.03442, astro-ph/0006053, 1206.2332). In the mathematics blocks the example is often a displayed equation set up with "suppose" or "consider" (0805.4471, math/0409186, math/0502327, 1507.04544).

Closing. Paragraphs close in one of three ways (impression, supported by the blocks named): a short evaluative or practical sentence (1202.3665, 1303.3997, 1708.01492); a consequence for the field or for future work (0912.3599, 1111.4246, 2103.00020); or a hedge on the scope of the claim (1206.2332, 1609.02907). A closing summary sentence that repeats the paragraph is rare; it was found in 3 of 31 (1004.4170, 1305.3347, 2304.03442).

Hand-over. Consecutive paragraphs are linked by a repeated noun or by a series marker more often than by a connective. Counted: "another" plus noun, or an ordinal, at a paragraph start in 14 of 31 (above); a repeated head noun from the previous paragraph's last sentence in 12 of 31 (astro-ph/0006289, 1111.4246, 1206.2332, math/0410542, q-bio/0512013). A connective ("however", "finally") at a paragraph start occurs in 8 of 31 (1507.04544, 1203.6372, math/0502327, 1202.3665).

Constructed example (paragraph with claim, reason, qualification): The packed-bed model overpredicts the hot-spot temperature at low flow rates. The axial dispersion term, neglected here, becomes comparable to convection when the particle Péclet number falls below about 2. A dispersion correction would remove most of the discrepancy, although it adds one fitted parameter.

## 3. Sentences

Length and rhythm. Measured mean sentence length 23.3 words [20.8, 28], standard deviation 10.8 [8.44, 13.4], coefficient of variation 0.448 [0.399, 0.506]; 9.6 % of sentences exceed 40 words [0, 15.1 %]. Sentences are slightly longer than in results (19.9) and introductions (22.4). Variation is real: 17 of 31 blocks contain at least one sentence of seven words or fewer (script count; a few hits are list labels), and in the strongest cases the short sentence carries a verdict after a long explanatory one (1202.3665, 1303.3997, 2103.00020, 1708.01492, 1507.04544).

Information flow. The subject position holds known material: the method or tool name, "our results", "this model", a quantity defined earlier. The new element (a number, a comparison, a condition) sits at the end of the sentence. Tool or method names are the grammatical subject of several consecutive sentences in 10 of 31 (2103.00020, 1708.01492, 1305.3347, 1303.3997, 1111.4246). Conditions are usually fronted with "if", "when", or "for" before the main clause (1202.3665, 1111.4246, 1609.02907, 1206.2332).

Constructed example (known subject, new information at the end): The bubble-sort variant is stable for all inputs. Its run time, however, grows with the square of the list length, and for lists above about 10^4 items merge sort is faster by more than an order of magnitude.

Openers. Measured share of sentences opening with a listed connective: 8.9 % [5.7, 15.1 %]; bare "This/These" plus verb: median 0 [0, 5.3 %]. Typical openers by count: "we" or "our" (present in 30 of 31 blocks; absent only in 0912.3599, which uses "our" and "this paper"); "in this paper/work/study" or "this paper" in 18 of 31 (math/0410542 has 5, 2304.03442 3, 1206.2332 3).

"We" and voice. Measured "we/our/us" rate 12.8 per 1000 words [8.22, 20.1]; passive share 21.5 % of sentences [14.1, 32.7 %], lower than methods (29.3 %). "We" carries actions and judgements: what the authors did, found, believe, or plan ("we have shown", "we suspect", "we hope to report"). The passive appears where the agent is the field or no one: descriptions of prior results, of data, and of what remains to be done (astro-ph/0009005, 2304.03442, 1305.3347, 1405.0312). "We believe/suspect/speculate/think" as a frame for an untested claim appears in 6 of 31 (2212.04356, 2304.03442, 1206.2332, 1303.3997, 1305.3347).

Impersonal "one". "One would/might/could" carries the open-problem voice in 5 of 31, all from the same mathematics and signal-processing school (0805.4471 with 9 uses, math/0502327 4, 0810.3286 2, math/0409186 2, math/0410542 1).

Second person. Measured "you" rate: median 0 [0, 0]. One block, 1202.3665 (a software paper), uses "you" 31 times and imperatives as practical advice.

## 4. Claims and evidence

Hedging. Measured hedge rate 6.89 per 1000 words [4.52, 14.2], the highest of all paper units read in the corpus (introduction 3.95, results 3.48, conclusion 3.36). The hedges are not spread evenly. Counted by reading: in 15 of the 17 recap openers the recap sentence itself carries no hedge (1111.4246, 1206.2332, 1609.02907, 0805.4471, astro-ph/0006053); the hedges cluster in limitation, mechanism, and future-work paragraphs. Examples of concentration: "may/might" 13 times in 2304.03442, almost all in its limitations and ethics subsections; 10 times in math/0502327, mostly in its improvements subsection; 8 times in astro-ph/0009005, in the paragraphs on possible evidence.

Explicit confidence. Unhedged strong claims are stated with a named basis: an added test (astro-ph/0006289 reruns its fit on the subsample shared with a competing paper before stating confidence), a count (2103.00020), or a direct comparison (1303.3997). "Confident" appears in 2 of 31 (astro-ph/0006289, 2103.00020).

Numbers. At least one concrete quantitative value appears in 12 of 31 (1303.3997 run times and substitution counts; 2103.00020 accuracy and compute factor; q-bio/0512013 percentage of structure captured; astro-ph/0006289 scatter in dex and sample sizes; 1608.06993 parameter counts). Numbers in discussions are nearly always comparative: against a baseline method (1303.3997, 1608.06993, 2103.00020), against an earlier sample (astro-ph/0006289), or against a null model (q-bio/0512013). Uncertainty on a stated number is rare: one block carries forward stated uncertainties (astro-ph/0009005); none of the other 30 give an interval or error bar in the discussion. Order-of-magnitude statements ("an order of magnitude faster", "a factor of several") stand in for exact values in 9 of 31 (1305.3347, 1202.3665, 0803.2392, astro-ph/0505010, math/0410542).

Constructed example (comparative number with baseline): On the 50-reactor test set the reduced mechanism reproduces the ignition delay of the full mechanism to within 8 % and runs 30 times faster.

Mechanism claims. Explanations of why a result holds are marked as such: "one explanation ... may be", "we speculate ... because", "is due to" (1608.06993, 1303.3997, 1305.3347, 1708.01492, astro-ph/0006053). Two blocks pose the mechanism as an explicit question before giving candidate answers (astro-ph/0006053, 1403.6652).

## 5. Terms and definitions

Discussions mostly reuse terms defined earlier in the paper. New terms introduced in the discussion are given with the full name first and the abbreviation in parentheses, then the abbreviation only: 7 of 31 introduce at least one term this way (1111.4246, 1202.3665, 0803.2392, 1010.3775, astro-ph/0009005, 1609.02907, 1206.2332). A new method name introduced in the discussion is usually followed by a one-sentence functional definition (0803.2392 for each competing algorithm; 1111.4246 for a related sampler; 1010.3775 for a node-swapping step).

Once introduced, the name is repeated exactly, often as the sentence subject, with no synonym cycling (2103.00020, 1708.01492, 1305.3347, astro-ph/0505010, 1111.4246). Impression: this repetition is the main cohesion device of the software and model papers.

Abbreviations used without expansion in the discussion (defined, presumably, earlier in the paper) occur in 8 of 31 (1303.3997, 1708.01492, 1203.6372, 1507.04544, astro-ph/0009005, math/0410542, 1206.2332, 0912.3599).

Constructed example: The method uses a moving-boundary approximation (MBA), in which the reaction zone is replaced by a sharp front. The MBA overestimates the front speed when the Thiele modulus is below 1.

## 6. Connectives and cohesion

Measured: connective openers 8.9 % of sentences; bare "This/These" plus verb median 0. The argument is carried mainly by:

- Repeated nouns and names (above; 10 blocks with a name as repeated subject).
- "Another" plus noun and ordinals for series of limitations, risks, or extensions: 14 of 31.
- "However" for the turn from a strength to a limitation: present in 21 of 31 (1609.02907 4 times, astro-ph/0009005 3, 1206.2332 3).
- "For example/for instance" for worked cases: 15 of 31.
- "This" plus noun (this framework, this assumption, this model) for back-reference; bare "This" plus verb also occurs (1608.06993, 2103.00020, 2304.03442), but it is a minority form by the metric.

Contrastive pairs "in principle ... in practice" or "in theory ... in practice" structure an argument in 3 of 31 (1202.3665, 1708.01492, 0810.3286). Impression: these pairs are an effective device for stating a trade-off in one sentence.

Constructed example: In principle a finer mesh always improves the solution; in practice, below 0.1 mm the round-off error in the pressure solve dominates.

## 7. Differences between groups

Mathematics and statistics (9) and the two mathematically styled computer science blocks (0805.4471, 0912.3599): the discussion is an open-problems section. Displayed equations set up the problem, the impersonal "one would like to know" voice dominates, direct questions are posed (0805.4471 has 4), and a follow-up paper is promised in 3 blocks (0810.3286, math/0409186, math/0502327). Hedging is heavy in the improvement and extension parts.

Astrophysics (5): longest discussions (three blocks over 1000 words excluding references). Arguments with named prior studies, author–year citations in running text, competing physical explanations weighed in turn, and conditional predictions (astro-ph/0006053, astro-ph/0006289, astro-ph/0009005). One software paper (1202.3665) is an advice section in the second person.

Machine learning and recent computer science (2103.00020, 2212.04356, 2304.03442, 1512.03012, 1609.02907, 1608.06993): limitations and future work dominate, often as run-in labelled paragraphs. 1608.06993 is the exception: an analysis of why the architecture works, with an added experiment and a bulleted list of observations.

Quantitative biology (7): software and method papers (1303.3997, 1305.3347, 1708.01492, 1203.6372) state speed and accuracy against named competing tools, attribute performance to specific algorithmic components, and close with a value statement. Sentences are shorter and plainer (impression). Model papers (1206.2332, q-bio/0512013) discuss assumptions and generality.

## 8. Weak patterns

- Promotional adjectives and evaluative intensifiers in the recap or close: 6 of 31 (1004.4170, 0912.3599, 2304.03442, 1305.3347, 1512.03012, math/0410542). The weakest instance (1004.4170) calls its own results exciting and the algorithm very promising without a supporting number.
- Future-work lists without specifics (what would be done, with what expected effect): 4 of 31 (1004.4170, 2304.03442, 1512.03012, 1405.0312).
- Recap that repeats the abstract with no new interpretation: 4 of 31 (1405.0312, 0810.3286, 1004.4170, astro-ph/0505010).
- Very long sentences stacking several clauses and semicolons: 1202.3665 has 13 semicolons in about 1150 words of prose; 1004.4170 and astro-ph/0009005 have sentences of more than 50 words that join a condition, a result, and a qualification.
- Abbreviations not expanded in the section: 8 of 31 (section 5).
- Grammar and typing errors left in the text (wrong verb form, wrong agreement, doubled letters): 5 of 31 (1203.6372, 1206.2332, math/0502327, q-bio/0512013, 1305.3347).
- Unfinished or flattened text: 1403.6652 (editor notes left in), 0803.2392 (paragraph structure lost; the bundle may have flattened it).
- Priority and origin remarks (where the work was first presented, when a competing paper was seen): 3 of 31 (astro-ph/0006289, math/0410542, 0803.2392).

## 9. Comparison with the house rules

Rules the strong texts follow:

- Term consistency (Section 4, "repeat the correct term"): the method name is repeated exactly, with no synonym cycling, in 10 blocks with a name as repeated subject (1111.4246, 1708.01492, 2103.00020, 1305.3347, 1303.3997).
- Quantitative, comparative statements (Section 3): the strongest blocks give a number with a named baseline (1303.3997, 2103.00020, astro-ph/0006289, 1608.06993, q-bio/0512013).
- Operational depth (Section 7): practical recommendations are stated as procedures with values (1202.3665 gives an acceptance-fraction range and a run length in autocorrelation times; 1507.04544 gives the failure condition for leave-one-out as a concrete example).
- Uncertainty stated plainly (Section 2, "honesty over completeness"): limitations sections in 16 of 31 say what fails and where (2103.00020, 1206.2332, 1507.04544, 1609.02907).
- No second-person asides (Section 2): 30 of 31 (exception 1202.3665).
- Low em dash density (Section 4): measured median 0 per 1000 words [0, 0.32]; exceptions 1202.3665 and astro-ph/0006289 with 5 each.

Rules the strong texts break:

- Impersonal register (Section 2): "we" appears in 30 of 31, at 12.8 per 1000 words, including in the most cited and best-written blocks (1111.4246, 1206.2332, astro-ph/0006289). Belief frames ("we believe", "we suspect") appear in 6.
- "No unsourced Future outlook section" (Section 4): forward-looking material without a source appears in 22 of 31 and closes 18. In this genre it is the normal final move.
- Nominal, impersonal headings (Section 2): question headings and conversational labels appear in 3 of 31 (1403.6652, 1202.3665, 1010.3775 with a "note on" heading).
- Overused-word set (Section 4): words from the list ("crucial", "key", "valuable", "enhance", "highlight", "emphasize", "robust" in its non-technical sense) appear in 9 of 31 (2212.04356, 1303.3997, 2304.03442, 0810.3286, 1111.4246, 1507.04544, 1203.6372, 0805.4471, q-bio/0512013), mostly once each; 2304.03442 is the only cluster.
- "In summary" (Section 4): 2 of 31 (astro-ph/0505010, 1111.4246).
- Negative parallelism (Section 4): "not X but Y" constructions in 3 of 31 (astro-ph/0006289, q-bio/0512013, 1203.6372). In astro-ph/0006289 the construction carries the main interpretive claim and reads as precise.
- Explain, not persuade (Section 2): discussions argue for their own result against competing work in 7 of 31 (astro-ph/0006053, astro-ph/0006289, math/0410542, 0803.2392, 1609.02907, 1303.3997, 1004.4170). In the strong cases the argument rests on a check or a number; in 1004.4170 it rests on adjectives.
- Citation of every choice (Section 8): measured citations 0.098 per sentence [0, 0.26], against 0.273 in introductions. Mechanism and future-work claims in discussions are often uncited (1004.4170, 1303.3997, 1708.01492, 1305.3347).
- Symbols defined at or before first use (Section 5): broken in the 8 blocks with unexpanded abbreviations, as read in isolation; the definitions may sit earlier in the full papers, which was not checked.

Not verified: whether abbreviations unexpanded in a discussion are defined elsewhere in the same paper, and whether the flattened block 0803.2392 had paragraph breaks in the source.
