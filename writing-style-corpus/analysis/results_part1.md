# Results sections of highly cited STEM papers: bundle part 1

## Material and counting basis

The bundle holds 33 documents: astrophysics 5 (0909.0948, 1509.06555, astro-ph/0006053, astro-ph/0009005, astro-ph/0505010), computer science and EESS (other) 8, condensed matter 1, machine learning 8, mathematics and statistics 4, physics (other) 2, quantitative biology 5. All 33 were read in full as given.

Two limits of the material affect the counts. First, 20 documents stop at about 1500 words, so late moves (closing summaries, limitations) are under-counted for them. Second, 15 documents arrive as one unbroken block with no paragraph breaks (for example 0909.0948, 1506.01497, 1512.03385, 2103.00020, 1405.0301), so paragraph statements rest on the 18 documents that keep their breaks.

Five of the 33 are not empirical results under any reading: a review of analysis ingredients (0909.0948), a program manual (hep-ph/0603175), a list of software uses (1707.00027), and two proof sections (0803.2392, the first part of math/0502327). Counts of "results" moves below use the remaining 28 as denominator unless stated; counts of sentence and wording habits use all 33.

Measured features (results row of `metrics_summary.csv`, n = 63 results sections in the full corpus, median [interquartile range]): mean sentence length 19.9 [18.1, 22.1] words, sentence-length standard deviation 10.3 [8.93, 11.5], share of sentences over 40 words 0.0425 [0.0164, 0.0714], passive share 0.213 [0.155, 0.286], we/our/us 19.6 [10.8, 26] per 1000 words, hedges 3.48 [2.02, 5.26] per 1000 words, connective openers 0.0667 [0.0385, 0.101] of sentences, bare "This/These + verb" openers 0.0206 [0, 0.0364], paragraph length 87.4 [59.8, 103] words, semicolons 0.912 [0, 2.17] per 1000 words, em dashes 0 [0, 0], citations 0.0972 [0.0426, 0.178] per sentence. A typical full results section has 1410 [935, 2620] words in 80 [51, 132] sentences.

## 1. Structure

Counted. The usual sequence is: purpose of the section, setup (data, protocol, metric, hardware), result tied to a figure or table, comparison with a baseline, explanation of the cause, caveat, and a closing generalisation. The cycle from "result" to "explanation" repeats once per experiment, usually once per subsection.

- A purpose or roadmap statement opens the section in 25 of 28 (for example 1509.06555, 0912.3599, 1409.1556, 1111.4246, q-bio/0402017). The three exceptions start with datasets (2105.05537), an error caveat (astro-ph/0006053), or an implementation note (1203.6372). The opener is either "In this section, we ..." or a purpose infinitive "To assess X, we ...".
- One subsection per dataset, task, or experiment, each repeating the same internal order, in 17 of 28 (1610.06475, 1810.04805, 1403.6652, cond-mat/0106096, 1203.6372).
- Setup written inside the results section, before any finding, in 27 of 28. In 7 of 28 the setup takes more than half of the text read (1607.00653, 2304.03442, 1111.4246, 1405.0301, 1810.04805, 1502.03167, 2105.05537).
- A comparison with a named baseline or earlier result in 22 of 28 (1506.01497, 1502.00956, astro-ph/0505010 against ideal scaling, 1203.6372 against an imputation method).
- An explicit caveat on the comparison or the test conditions in 9 of 28 (2103.00020, astro-ph/0505010, 1608.06993, 1610.06475, 1502.00956, 0912.3599, 1405.0301, 1203.6372, 2304.03442).
- A future-work sentence in 5 of 28 (2105.05537, 1512.03385, 1003.1594, astro-ph/0009005, math/0502327 in its remark).

Constructed example of one cycle: "To measure the effect of baffle spacing, we ran the exchanger at five spacings with a fixed flow rate of 2.0 kg/s. Table 3 lists the overall heat-transfer coefficient for each run. The coefficient rises from 410 to 560 W/(m² K) as the spacing falls from 0.5 to 0.2 m. This rise follows from the higher cross-flow velocity at small spacing."

Impression. Results sections in this bundle are less a report of numbers than a sequence of small arguments, each closed by a sentence that says what the number means.

## 2. Paragraphs

Counted on the 18 documents with paragraph breaks.

- The paragraph opens on a condition or a pointer to a display in 14 of 18: "In this experiment we vary ...", "Figure 4 shows ...", "On the second dataset ..." (1403.6652, 1609.03499, 1409.1556, 1608.06993, 1203.6372).
- The paragraph develops as observation, then number, then cause, in 12 of 18 (astro-ph/0006053, 1409.1556, 1608.06993, 1609.03499, 1203.6372, q-bio/0402017).
- The paragraph closes on an interpretive sentence ("This confirms ...", "These results show ...") in 12 of 18 (1403.6652, 1409.1556, 1609.03499, 1203.6372, 1003.1594, astro-ph/0006053).
- Paragraph length is short in machine learning and software papers: 1 to 4 sentences in 1403.6652, 1810.04805, 1409.1556, 1305.3347. Astrophysics and statistics paragraphs run 5 to 10 sentences (astro-ph/0006053, 1203.6372).

Handover between paragraphs takes four forms, counted on all 33:

- "Next" or "We next" at the start of a paragraph or experiment: 7 documents (1506.01497, 1512.03385, 0912.3599, 0803.2392, math/0502327, 1509.06555, 2304.03442).
- A participial bridge that summarises the last step before the new one ("Having fixed the inlet temperature, we now vary ..."): 5 documents (1409.1556, astro-ph/0009005, 0909.0948, 1405.0301; 1409.1556 also uses "Up until now").
- A contrast on a new subset, opened by the subset name: astro-ph/0006053 (second sample), 1203.6372 (larger cohort), 1111.4246 (one model that behaves worse).
- An anomaly followed by a test: an unexpected count or value, a hypothesis, a check, and a revised count. 6 documents (1203.6372, 1512.03385, 1502.03167, 0912.3599, 1506.01497, astro-ph/0006053).

Constructed example of the anomaly handover: "The balance closed to within 1 % for all runs except run 7, which lost 6 % of the feed. A leak at the sampling valve was suspected, so the valve was replaced and run 7 repeated. The repeated run closed to within 0.8 %."

## 3. Sentences

Counted.

- Length and rhythm. Results sentences are the shortest of the paper prose units: 19.9 words median, against 21.4 for methods, 22.4 for introductions, 23.3 for discussions and 24.6 for abstracts. Long sentences are rare (4.25 % over 40 words, against 6.66 % in introductions). The spread (standard deviation 10.3 words) comes from short verdict sentences placed after long setup sentences. Short verdicts of five to eight words appear in 6 documents (astro-ph/0006053, 1409.1556, astro-ph/0009005, astro-ph/0505010, 1506.01497, 0803.2392).
- Subject position. The subject is the method or system under test, a display ("Table 2", "Figure 5"), or the experimenters ("we"). Display subjects with a reporting verb (shows, presents, compares, plots) occur in 21 of 33 documents; 1502.00956, 1506.01497, 0912.3599 and 1610.06475 each have five or more.
- Stress position. The number, the comparison or the cause sits at the end: "... reaches 94 % conversion at 600 K" rather than "94 % conversion is reached ...". Counted impression: this end-placement holds for most quantitative sentences in the 8 machine-learning documents and in 1502.00956, 1610.06475, 1203.6372.
- Known to new. The next sentence opens with the noun just introduced, or "This" plus a noun ("This rise ...", "This sequence ..."): "This/These + noun" openers in 14 documents (1403.6652, 1607.00653, 1512.03385, 2103.00020, 0803.2392, q-bio/0402017).
- "We". Used in 30 of 33 documents; absent from 0909.0948, astro-ph/0009005 and hep-ph/0603175, and nearly absent from cond-mat/0106096 (2 uses). The measured rate (19.6 per 1000 words) is the highest of any paper unit, above methods (15.8) and introductions (10.6). "We" attaches to two jobs: actions taken in setup ("We train ...", "We split the data ...") and acts of observation ("We observe", "We note", "We find"), the latter in 15 documents (1509.06555, 1609.03499, 1810.04805, astro-ph/0505010).
- Passive voice. Passive share is 0.213, lower than methods (0.293). The passive carries standard procedures and the data themselves ("The models were trained for 90 epochs", "The flux is computed as ..."). 2105.05537 and the text-to-speech part of 1609.03499 are mostly passive; 1512.03385 and 1506.01497 are mostly active.
- Tense. Present tense for what a display shows and for what holds in general; past tense for what was done. Setup in present tense in 8 documents (1403.6652, 1506.01497, 1512.03385, 1608.06993, 1810.04805, 1607.00653, 0912.3599, 1509.06555); setup in past or present perfect in 10 (1609.03499, 1502.03167, 2304.03442, astro-ph/0006053, 1203.6372, 1111.4246, 1207.3907, 1305.3347, 1003.1594, 1502.00956).
- Openers. Ordinal openers (First, Second, Finally, Last) structure a set of observations in 8 documents (1409.1556, 1512.03385, 1506.01497, 1705.07874, 0912.3599, 1403.6652, astro-ph/0505010 with numbered reasons, 1003.1594). Connective openers are rare (6.67 % of sentences); "However" is the commonest, in 17 of 33.

Constructed example of the rhythm: "We repeated the sort on arrays of 10³ to 10⁷ integers, five runs per size, on one core. The running time grows as n log n over the whole range, with a fitted exponent of 1.02 ± 0.01 on n. The constant is small."

## 4. Claims and evidence

Counted.

- Number with baseline. A result number is paired with a named baseline and a difference in 22 of 28. Machine-learning documents give both the absolute value and the gain ("from 72 % to 76 %, 4 points above the best earlier model") in all 7 that report numbers (1409.1556, 1502.03167, 1506.01497, 1512.03385, 1608.06993, 1810.04805, 2103.00020).
- Uncertainty. A spread, interval, test or repeat count is given in 9 of 28 (1607.00653 with seeds and a p-value, 1502.00956 and 1610.06475 with medians of five runs, 2304.03442 with rating means, standard deviations and rank tests, 1003.1594 with mean, standard deviation and success rate, astro-ph/0006053 with reduced chi-squared, 1509.06555 with random-position noise estimates, 1405.0301 with scale and parton-distribution uncertainties, 1111.4246 with ten seeds). Of the 7 machine-learning documents with numbers, none gives a spread; 1608.06993 states that each setting was evaluated once.
- Units. Dimensional quantities carry units in all 5 astrophysics documents, both SLAM documents (1502.00956, 1610.06475), 1609.03499, astro-ph/0505010 and 1405.0301. Error rates and accuracies in machine learning are percentages or points without further qualification of the test set size.
- Operational definition of the metric. The measured quantity is defined by procedure in 10 of 28: 1111.4246 (effective sample size and why the minimum over dimensions is reported), 1409.1556 (top-1 and top-5 error), 1509.06555 (aperture flux and profile width), 1203.6372 (root-mean-square deviation against chip genotypes), 2304.03442 (rank data converted to a rating), 1502.00956 (trajectory alignment before error), 0912.3599 (success threshold), math/0502327, 1003.1594, 1506.01497.
- Strength. Claims on measured numbers are unhedged. Hedges ("may", "likely", "suggests", "could be due to") attach to causes in 11 documents (1608.06993, 1506.01497, 2105.05537, 1609.03499, 1207.3907, 1203.6372, 1610.06475, astro-ph/0006053, 1502.00956, 1111.4246, 1512.03385). Hedge rate is 3.48 per 1000 words, half the discussion rate (6.89).
- Inference labelled as inference. A first-person verb marks a conjecture in 7 documents: "We argue", "We conjecture", "We attribute this to", "We hypothesize", "We believe" (1512.03385, 1608.06993, 1409.1556, 1506.01497, 1111.4246, 1203.6372, astro-ph/0006053).
- Evaluative verdicts. A judgement word follows a result in 13 of 33 ("remarkable", "surprising", "interesting", "promising", "disappointing", "quite good"): astro-ph/0006053, 1409.1556, astro-ph/0505010, astro-ph/0009005, 1506.01497, 1502.00956, 0912.3599, 1608.06993, 1403.6652, 1609.03499, 2105.05537, 1207.3907, q-bio/0402017.

Constructed example of graded strength: "The packed bed removes 99.2 % of the sulphur at 350 °C, against 97.5 % for the reference sorbent (three runs each, range ±0.3 %). We attribute the gain to the larger pore volume, which the nitrogen isotherms confirm only qualitatively."

## 5. Terms and definitions

Counted.

- Full form followed by the short form in parentheses at first use, then the short form only: 11 documents (1502.00956, 1203.6372, 1609.03499, 1111.4246, 1506.01497, 2105.05537, 1610.06475, 1810.04805, cond-mat/0106096, 1608.06993, 1409.1556).
- A label coined for a subset or a variant, then reused unchanged: 7 documents (astro-ph/0006053 with two named samples, 1512.03385 with lettered options, 1502.03167 with named network variants, 1405.0301 with named cuts introduced by "we shall call", math/0502327 with an "exceptional set", 1409.1556 with lettered configurations, 2304.03442 with named ablation conditions).
- Abbreviations used in the section without a definition there: 12 documents (1509.06555, astro-ph/0006053, astro-ph/0009005, 0912.3599, 1502.00956, 1609.03499, 2304.03442, 1405.0301, 1203.6372, 1506.01497, 1610.06475, 2105.05537). Many are defined earlier in the paper; the results section relies on that.
- A term once introduced is repeated, not varied. No document cycles synonyms for a method or a metric name (impression from reading all 33; no counter-example found).

Constructed example: "The effectiveness–number of transfer units (ε–NTU) method gives the outlet temperatures. With ε–NTU, the counter-flow unit reaches ε = 0.82 at NTU = 3."

## 6. Connectives and cohesion

Counted.

- The main link is repetition of the noun or "This/These + noun" (14 documents with "This + noun" openers; repetition of the method name is present in all 28 empirical documents).
- Bare "This + verb" ("This shows that ...", "This indicates ...") referring to the whole previous sentence: 15 documents (1509.06555, astro-ph/0006053, astro-ph/0009005, astro-ph/0505010, 0912.3599, 1502.00956, 1607.00653, 1609.03499, 1409.1556, 1506.01497, 1512.03385, 1608.06993, 1003.1594, 1111.4246, cond-mat/0106096). Measured share is 2.06 % of sentences, about the same as in methods (2.19 %).
- Causal links are dense: "because", "due to" and "owing to" occur in 22 of 33 documents, with 11 in astro-ph/0009005 and 7 each in astro-ph/0505010 and 1506.01497.
- Explicit connectives are sparse (6.67 % of openers). Sentence adverbs of surprise or emphasis ("Interestingly", "Notably", "Strikingly", "Admittedly") open sentences in 7 documents (0909.0948, 0912.3599, 1409.1556, 1502.03167, 1506.01497, 1512.03385, 1203.6372).
- Gloss after a formula: "In words, ...", "In other words, ..." or "Roughly, ..." restates an equation or a number in plain language in 3 documents (0803.2392 twice, math/0502327 twice, 1403.6652).

Constructed example of the gloss: "The residual falls by a factor of 0.3 per sweep. In words, each Gauss–Seidel sweep removes about two thirds of the remaining error."

## 7. Differences between groups

Counted where stated, impression otherwise.

- Machine learning (8 documents). One subsection per benchmark; present tense; run-in labels ending in a full stop ("Accuracy.", "Capacity.") in 5 (1502.03167, 1506.01497, 1512.03385, 1608.06993, 1409.1556); "outperform" in 7 of 8; percentages with baselines but no spread (section 4). The strongest examples (1512.03385, 1506.01497) pair every number with a cause sentence.
- Computer science and EESS, other (8). The SLAM papers (1502.00956, 1610.06475) add hardware, frame rates and failure cases with causes. The human-subject study (2304.03442) states research questions as questions and gives the statistical tests by name. 2105.05537 has the weakest claim-to-evidence ratio in the group.
- Astrophysics (5). Longer paragraphs, more causal clauses, units on every quantity, evaluative words ("remarkable", "disappointing"), and author-year discussion of earlier estimates. Two of five (0909.0948, astro-ph/0009005) use no "we".
- Mathematics and statistics (4). Two are proofs written as reasoning steps ("Observe that ...", "Combine the two lemmas to see ..."), with plain-language glosses after equations. 1111.4246 has the most careful metric definition in the bundle. 1003.1594 asserts reasons for its results without tests.
- Quantitative biology (5). Three short software or simulation reports (1207.3907, 1305.3347, 1707.00027); 1203.6372 and q-bio/0402017 are investigative and give counts at every step.
- Physics, other (2) and condensed matter (1). 1405.0301 uses long scoping sentences and "We stress" twice; hep-ph/0603175 is manual text in second person; cond-mat/0106096 reports other authors' measurements with author-year attribution in every sentence.

## 8. Weak patterns

Counted. These habits reduce readability and are not models for the guide.

- Verdict without a number. Promotional or global claims with no figure attached in 8 documents (1403.6652, 2105.05537, 1502.03167, 1608.06993, 1607.00653, 1207.3907, 2103.00020, 1610.06475). Examples of the form: a single accuracy value presented as proof of "good generalisation"; a point-cloud picture presented as proof of high accuracy.
- Display pointer without a finding. A sentence names a figure and its axes and stops ("Figure 6 shows the effect of increasing n"): 1403.6652 has four in a row; also 1305.3347 and 1707.00027.
- Setup crowding out results (7 documents, section 1).
- "It can be seen that" as filler before a finding: 4 documents (1502.00956 four times, 1609.03499, 2105.05537, 1610.06475).
- Stacked hedges on one claim ("possibly ... may"): 1608.06993, 1111.4246 (three "seems" in two sentences), astro-ph/0006053.
- Bare "This shows" where the antecedent is a whole paragraph: 15 documents use bare "This + verb"; in 1509.06555 and 1607.00653 the antecedent is unclear.
- Missing spread on single-run numbers in all 7 machine-learning documents with numbers.
- Language errors left in print: 10 documents (1403.6652, 2105.05537, 1003.1594, astro-ph/0009005, 1203.6372, 1207.3907, 1607.00653, 1609.03499, 1502.00956, 1512.03385).
- Humour and exclamation marks: 0912.3599, 2103.00020.

## 9. Comparison with the house rules

Rules the strong texts follow (strong texts here: astro-ph/0006053, 1512.03385, 1506.01497, 1409.1556, 1203.6372, 1111.4246, 1502.00956, astro-ph/0505010):

- Quantitative, specific wording (Section 3): numbers with baselines in 22 of 28, units on dimensional quantities in the astrophysics and SLAM documents.
- Operational definition of computed quantities (Section 7): 10 of 28, led by 1111.4246, 1409.1556, 1203.6372.
- Separation of fact from inference (Section 2): hedges sit on causes, not on measurements (11 documents), and conjectures carry a first-person verb (7 documents).
- Abbreviation next to its full form (Section 5): 11 documents.
- Term consistency (Section 4): no synonym cycling found.
- Citation of each analysis choice (Section 8): the regression routine in astro-ph/0006053, the rank test, post-hoc test and correction in 2304.03442, the classifier library in 1403.6652.
- Em dashes low (Section 4): measured median 0 per 1000 words.
- Equations numbered and cited in text (Section 9): astro-ph/0006053, 1203.6372, 1405.0301, 0803.2392.

Rules the texts break:

- "**Term:** description" lists (Section 4): run-in labels in 9 documents (1502.03167, 1506.01497, 1512.03385, 1608.06993, 1409.1556, 1111.4246, 2304.03442, 1607.00653, 2105.05537). In 1512.03385 and 1608.06993 the labels mark parallel experiments and read well; the rule may need an exception for that use.
- Second-person and imperative asides (Section 2): 4 documents ("please refer", "up to you"): hep-ph/0603175, 1609.03499, 1608.06993, 2103.00020.
- Promotional wording (Section 4): 8 documents (section 8 above).
- Overused word list (Section 4): at least one listed word in 18 of 33, mostly single uses and "robust" in its technical sense (1502.00956, q-bio/0402017). Clusters appear only in 0909.0948 ("crucial" twice) and 1608.06993 ("highlight" twice); 1203.6372 has three different listed words in one section.
- Negative parallelism (Section 4): "rather than" or "but not" in 10 documents (1409.1556, 1502.03167, 1506.01497, 1512.03385, 2103.00020, 1405.0301, 0909.0948, 0912.3599, astro-ph/0009005, math/0502327), almost always to state scope ("we compare the trend, not the absolute value"). The texts use it as a scope statement, which the rule does not separate from the stock form.
- Number typography (Section 9): number and unit written without a space, or ranges with a hyphen, in 7 documents (1502.00956, 1506.01497, 1610.06475, 2105.05537, 1203.6372, 1305.3347, 1003.1594).
- Caveats inside the document (Section 6): 9 of 28 put comparison caveats in the results text. For a research paper these caveats are part of the evidence; the house rule targets engineering and runtime caveats, and the difference should be stated in the guide.
- Impersonal register (Section 2): the strong texts use "we" heavily (19.6 per 1000 words), always for actions and observations, never for feelings. The house rules do not forbid "we"; the corpus supports its use in results.
- Uncertainty (Sections 2 and 10): no spread on single-run numbers in all 7 machine-learning documents with numbers; the house rule on error-bar definitions is not met there.

## Counted versus impression

Counted: every "n of N" statement above, from reading all 33 documents and from pattern counts over the bundle text, and the measured features taken from `metrics_summary.csv`. Impression: the description of results sections as chains of small arguments (section 1), the end-placement of numbers (section 3, counted only for the named groups), and the absence of synonym cycling (section 5, which is a negative finding, not a count of instances). Counts of late moves (future work, closing summaries) are lower bounds because 20 documents are cut at about 1500 words.
