# Introductions of highly cited STEM papers, part 1

## Scope and method

The bundle holds 51 introductions: astrophysics 9, computer science and EESS (other) 10, condensed matter 3, machine learning 10, mathematics and statistics 9, physics (other) 5, quantitative biology 5. All 51 were read in full.

Eleven blocks are cut at about 1500 words and have lost their paragraph breaks (0805.4471, 1502.00956, 1608.04644, 1610.05820, 1409.0575, 0803.2392, math/0307152, math/0409186, math/0502327, 0906.0612, 1410.3012). Counts that depend on paragraphs or on the end of the introduction use only the other 40 blocks, and this is stated where it applies. Several blocks also run on into the next section (1502.01583, 1409.4842, 2308.04079, 1406.5823, 1102.1523), and 1009.1622 ends with a variable table. Move counts use only the text before the first new section heading.

Counts marked "counted" come from a manual coding pass over each document or from regular-expression counts on the bundle (sentence split at full stops, so the sentence length here runs about 3 words longer than the spaCy figures). Statements marked "impression" are judgements that were not counted. The measured features below are the introduction row of `metrics_summary.csv` (n = 102, both halves of the corpus; median with interquartile range).

| Feature | Median [IQR] |
|---|---|
| Words per introduction | 831 [538, 1310] |
| Sentences | 37.5 [22.8, 56.2] |
| Words per sentence | 22.4 [20.7, 25.5] |
| Share of sentences over 40 words | 0.067 [0.025, 0.118] |
| Share of sentences with a passive | 0.25 [0.17, 0.35] |
| we/our/us per 1000 words | 10.6 [4.9, 17.7] |
| Hedge words per 1000 words | 3.95 [1.38, 6.65] |
| Share of sentences opening with a connective | 0.086 [0.039, 0.134] |
| Share opening with bare This/These + verb | 0.012 [0, 0.038] |
| Words per paragraph | 94.2 [64.6, 126] |
| Citations per sentence | 0.27 [0.14, 0.42] |
| Em dashes and semicolons per 1000 words | 0 [0, 0] and 0 [0, 1.87] |

## 1. Structure

Counted move sequence. The usual order is field context, then a gap or limitation, then the paper's contribution, then (optionally) a preview of results, then (optionally) a section roadmap.

- Context first: 47 of 51 open with the field or the problem, not with the paper. The four that open with the paper or product itself are 1502.01583, 1406.5823, 1410.3012 and math/0502327.
- Explicit gap before the contribution: 37 of 51 (for example 1512.03385, 1502.03167, 0802.1189, 1105.0828, cond-mat/0308217). Of the 14 without one, 11 are software, data-release, mission or review papers (1009.1622, 1502.01583, 1609.04153, 1603.04467, 1709.10010, 1201.0490, 1409.0575, 1406.5823, 0906.0612, 1410.3012, 1707.00027), where the paper describes a product and the "gap" is replaced by its history.
- Contribution statement with "In this paper/work/article/Letter" or "This paper/article": 41 of 51 (for example astro-ph/0006053, 1506.01497, 1305.3347, hep-ph/0201195).
- Results previewed in the introduction: 18 of 51. Eleven give numbers for the paper's own result (1403.6652, 1608.04644, 1610.05820, 1706.02216, 1502.03167, 1506.01497, 1512.03385, 1409.4842, 2308.04079, 1105.0828, 1207.7235); seven state results without numbers (1502.00956, 2212.04356, 1608.06993, 1810.04805, 2103.00020, 1705.07874, astro-ph/0006053). Fifteen of the 18 are machine learning or computer science.
- Implication sentence after the result: 9 of 51 (astro-ph/0006053, 1512.03385, 1506.01497, 2212.04356, 2103.00020, q-bio/0402017, 1610.05820, 1409.4842, 1609.04153).
- Section roadmap: 17 of the 40 complete blocks, and 2 truncated ones (1409.0575, 1410.3012).

Typical length (counted, 40 complete blocks): median 7 paragraphs, range 2–16. Sentence counts follow the metrics row (median 37.5). Short introductions of 9–14 sentences occur in 6 documents (astro-ph/0006053, 1201.0490, 1705.07874, 1003.1466, 1004.4170, 1212.5226); all six still run context, contribution and either result or roadmap.

The context move takes most of the space (impression; in 2103.00020, 1506.01497 and astro-ph/0505010 the first contribution sentence comes after more than half of the text). The gap is usually one paragraph, sometimes one sentence.

Constructed example (four moves in four sentences): "Shell-and-tube exchangers are sized from correlations for the shell-side film coefficient. These correlations were fitted to clean tube bundles and overpredict the coefficient by 20–40 % once fouling builds up. In this paper we fit a correction factor to 312 plant measurements. The corrected correlation reduces the mean sizing error from 31 % to 9 %."

## 2. Paragraphs

Opening (impression): most paragraphs open with a noun-phrase subject that names the paragraph's topic (the problem, the prior method, the new system). A paragraph-initial connective ("However", "Instead", "Yet") marks the gap paragraph (1706.02216, 2212.04356, 1512.03385, 2103.00020).

Development. A paragraph usually states one claim and then supports it with a list of examples, a mechanism, or a sequence of prior works (impression). Prior work is told in chronological order with the cited work as grammatical subject in 2103.00020, astro-ph/0009005, 1609.04153 and 0906.0612. In method papers the middle paragraph develops a mechanism step by step: 1502.03167 (why shifting input distributions slow training), 1512.03385 (why a deeper net should not train worse), math/0502327 (reduction of decoding to sparse recovery).

Closing. Paragraphs end on the consequence that leads into the next move: a limitation (1506.01497, 1608.06993), a question (1512.03385, 1203.6372), or the new idea (cond-mat/0308217). Summary closers ("In summary") are rare: 2 of 51 (1610.05820, 0708.1752 uses it as a pre-roadmap note).

Handover. Counted: in 112 of 236 paragraph transitions (47 %) in the 40 complete blocks, the first sentence of the next paragraph repeats a content word (five letters or more) from the last sentence of the previous one. The highest rates are in 2212.04356 (6 of 7), 1608.06993 (5 of 6), 1207.3907 (5 of 6) and 1502.03167 (4 of 5); these read as the most continuous. The lowest are in q-bio/0402017 (2 of 11) and 1609.04153 (1 of 6), where paragraphs read as separate blocks.

Constructed example of a handover by repeated noun: "...so the fouling layer lowers the overall coefficient within weeks. ¶ The fouling layer grows at a rate set by wall temperature and velocity."

## 3. Sentences

Length and rhythm. Median 22.4 words (metrics). Long sentences over 40 words are 6.7 % of sentences, and 26 of 51 documents have at least one sentence over 60 words by the full-stop split (for example astro-ph/0009005, 1502.00956, 1709.10010, math/0307152). Impression: the strong texts alternate a long sentence carrying a mechanism or a list with a short sentence that states the point. Short point sentences of 5–10 words were noted in 1512.03385, 1502.03167, 2103.00020, 0802.1189 and 1203.6372 (not counted).

Constructed example: "Above a Reynolds number of about 10 000 the boundary layer near the wall becomes turbulent, the film resistance falls, and the measured coefficient rises with velocity to the power 0.8. The laminar correlation fails here."

Openers (counted, 1858 sentences): noun-phrase subject 62 %; connective or subordinate clause 15 %; This/These/Such 9 %; We/Our 7.6 %; "In this paper/work" 2 %. The metrics row gives 8.6 % connective openers by the stricter list.

Information flow. Impression, checked on the contribution paragraphs of 20 documents: known material sits in the subject (the problem named in the previous paragraph, the system's name) and the new item takes the end of the sentence (the new mechanism, the number). Examples: 1506.01497, 1608.06993, 1305.3347, 1207.7235. The contribution sentence typically has "we" as subject and the named method in final position.

Use of "we". Median 10.6 per 1000 words, with a wide spread by field (counted medians in this half): computer science 23.7, machine learning 12.3, mathematics 12.0, condensed matter 11.6, astrophysics 5.9, quantitative biology 3.0, physics 1.3. Five documents use no first person at all (0708.1752, astro-ph/0009005, 1201.0490, 0906.0612, 1305.3347) and use "this paper", "the present study" or the product name as subject instead. "We" carries actions of the authors (propose, show, evaluate, find); it is not used for background.

Mathematics papers use an inclusive "we" and "one" to walk the reader through an argument: "one can", "one would" occurs 12 times in 0805.4471 and in 9 more documents (for example math/0307152, math/0409186, 1409.4842).

Passive voice. 25 % of sentences (metrics). Placement (impression): the passive dominates in the context and prior-work moves (astro-ph/0009005, 0708.1752, 1609.04153, 1207.7235) and in descriptions of procedures (1207.7235 "were formally approved and fixed"). The contribution and result moves are mostly active with "we" (1506.01497, 1512.03385, 1706.02216).

## 4. Claims and evidence

Numbers. Where a result is given it is given with a comparison in 9 of the 11 documents with numeric results: against a baseline method (1706.02216, 1506.01497, 1409.4842), against the expected value (1207.7235, local significance against the expected significance), or as a fraction of baseline effort (1502.03167). 1512.03385 and 1610.05820 give absolute figures without a stated baseline in the same sentence. Uncertainty is stated in 1 of the 11 (1207.7235, significances in standard deviations, confidence levels for exclusion ranges). Units are given where the quantity has one (1506.01497 seconds per image, 1207.7235 masses and luminosity).

Prior work is often quantified to build the gap: 2103.00020 sets three accuracies against each other; 1506.01497 gives the per-image time of two proposal methods; 1207.7235 gives the excluded mass ranges.

Constructed example: "The corrected correlation predicts the 312 measured coefficients with a root-mean-square error of 9 % (±2 %, bootstrap over plants), against 31 % for the uncorrected correlation."

Strength of claims. Counted on the 18 documents that preview results: the result verb is unhedged in 17 ("we show", "outperforms", "achieves"); the exception is 1003.1466 ("seems more promising"). Hedges attach to implications and generalisations in 5 of the 18 (astro-ph/0006053, 1512.03385, 2212.04356, 1506.01497, 2103.00020: "suggest", "we expect", "may be"). Hedge words also cluster in explanations of why prior work falls short (2103.00020 "This is likely because"; 1409.4842 "One must be cautious"). Median hedge rate is 3.95 per 1000 words.

Priority and superlative phrases ("first", "for the first time", "to our knowledge") match in 20 of 51 by the regular expression, some of them false matches, most often in machine learning and computer science (1403.6652, 1502.00956, 1608.04644, 1810.04805, 2308.04079).

## 5. Terms and definitions

Acronyms. A parenthetical acronym after the full form at first use occurs in 31 of 51 documents (for example 1609.04153, 2308.04079, 1203.6372, hep-ph/0201195). 1609.04153 also points to a list of acronyms.

Naming the new method. An explicit naming formula ("which we call", "we refer to ... as", "we term", "codenamed") occurs in 8 of 51: 0805.4471, 1502.00956, 2212.04356, 1409.4842, 1502.03167, 1608.06993, 1705.07874, 2103.00020. In 1502.03167 the term is introduced for the problem first (internal covariate shift) and then for the method (batch normalisation), and both are then repeated unchanged. New terms are placed in quotation marks at first use in 9 documents (1506.01497, 1512.03385, 1810.04805, 1409.4842, 0802.1189, cond-mat/0308217, 1608.06993, 1610.05820, 1709.10010).

Reuse. Impression, consistent with the repetition counts in Section 6: once named, the term is repeated exactly, often as sentence subject (1305.3347 opens five consecutive sentences with the program name; 1506.01497 uses "RPN" in the same form throughout). Synonym cycling was not found in the strong texts.

Symbols. Symbols are defined in prose next to their equation in 1707.00027, 1406.5823 and 1502.03167; 1009.1622 gives a full variable table with the section where each symbol first appears.

Constructed example: "We call this correction the fouling factor, F. The fouling factor depends on wall temperature only."

## 6. Connectives and cohesion

The main link is the repeated noun, often with a demonstrative. Counted: "this/these" plus a noun (this approach, this problem, these methods) occurs 160 times; bare "This/These" followed by a verb as sentence opener occurs 48 times (metrics share 1.2 % of sentences). Explicit connectives open 8.6 % of sentences (metrics). The most frequent are "However", "In particular", "For example", "Furthermore" and "Finally" (impression from reading; not tallied per word).

Enumerations ("First", "Second", "Third" or "(i), (ii)") structure a gap or a method in 6 documents: astro-ph/0009005, 1203.6372, 1610.05820, 2308.04079, 1201.0490, 1502.03167.

Rhetorical questions carry the gap in 10 of 51 (1212.5226, 0805.4471, 1512.03385, 2103.00020, 0803.2392, 1004.4170, math/0409186, math/0502327, math/0610840, 1203.6372); 6 of the 10 are mathematics or statistics. In 1512.03385 and 2103.00020 a single question turns context into gap; in 0805.4471 (10 questions) and 1212.5226 (6) they come in series.

Constructed example: "The correction removes most of the bias. Can a single factor also cover the laminar range?"

## 7. Differences between groups

- Roadmap paragraph (counted): astrophysics 8 of 9, condensed matter 3 of 3, physics 2 of 5, mathematics 3 of 9, computer science 2 of 10, machine learning 1 of 10, quantitative biology 0 of 5.
- Result preview with numbers: 9 of 20 machine learning and computer science documents, against 2 of 31 elsewhere (1105.0828, 1207.7235).
- Contribution bullet list: 6 documents, all machine learning or computer science (1403.6652, 1502.00956, 1608.04644, 2308.04079, 1705.07874, 1810.04805).
- First person: highest in computer science (median 23.7 per 1000 words), lowest in physics (1.3) and quantitative biology (3.0).
- Mathematics introductions develop the theory inside the introduction, with definitions, theorems and subsections (0803.2392, math/0307152, math/0409186, math/0502327); this is why 4 of the 11 truncated blocks are mathematics.
- Software papers (12 of 51: 1009.1622, astro-ph/0505010, 1102.1523, 1603.04467, 0906.2569, 1709.10010, 1201.0490, 1406.5823, 1410.3012, 1305.3347, 1707.00027, 1207.3907) replace the gap with history and a feature list, and state availability or licence in 9 of the 12.

## 8. Weak patterns

- Citation lists that stand in for content: 10 documents have at least one sentence with five or more citation markers (for example 0909.0948, 1009.1622, 1603.04467, 1709.10010, 1707.00027). The sentence names no finding from the cited works.
- Very long sentences: over 60 words in 26 of 51 documents. The 116-word sentence in astro-ph/0009005 and the 129-word one in 1502.00956 hold several claims each.
- Hype and evaluative adjectives (counted from a list of 17 words such as "revolution", "groundbreaking", "dramatically", "remarkable", "excellent", "crucial"): at least one in 33 of 51; four or more in 0909.0948, 0906.2569, 1409.4842, 1512.03385, 0803.2392, 0906.0612 and q-bio/0402017.
- Promotional self-assessment: 1502.00956 ("most complete and reliable solution"), 1506.01497 ("elegant"), 0803.2392 ("Incredibly").
- Defensive or opinion paragraphs: 0708.1752 (a paragraph explaining that the paper is no accusation), 0906.2569 ("we believe" on licensing models), 1608.04644 and 1810.04805 ("we argue").
- Paragraphs of one or two sentences in series: 1102.1523, 0802.1189 (16 paragraphs in 878 words) and 1403.6652; the argument breaks into fragments.
- Typing errors, noted while reading: at least 17 documents (for example 1009.1622 "of of", 1305.3347, 1207.3907, 2308.04079, 2103.00020).
- Undefined acronyms at first use, counted only on a check of computer-science terms: "API" in 1610.05820, "ChIP-seq" in 1305.3347, and a mismatched "NBCR"/"NCBR" pair in 1707.00027.

## 9. Comparison with the house rules

Rules the strong texts follow:

- Definitions at first use (Section 5 of the rules): parenthetical acronyms in 31 of 51; symbols defined in prose by their equation in 1707.00027, 1406.5823, 1502.03167. A nomenclature table where a paper has many symbols: 1009.1622 (1 of 51).
- Quantitative wording and a comparison baseline (Sections 3 and 7): 9 of the 11 numeric-result introductions give a baseline (1706.02216, 1207.7235, 1506.01497).
- Repeating the correct term instead of synonyms (Section 4): 1305.3347, 1506.01497, 1502.03167.
- Prose as default form, bullets for parallel items (Section 6): 38 of 51 introductions have no bullet list; where lists occur they hold parallel contributions or features (1403.6652, 1709.10010).
- Low em dash and semicolon use (Section 4): median 0 per 1000 words for both.
- Separation of verified result and inference (Section 2): the hedge sits on the implication, not the result, in 5 of the 18 result previews (astro-ph/0006053, 1512.03385, 2103.00020).

Rules the texts break:

- Impersonal register (Section 2): first person in 46 of 51; second person "you" in 1410.3012, "the reader" in 1009.1622 and 0708.1752. The rules do not forbid "we" in papers, but they ask for an impersonal register; the corpus strongly prefers "we" for the authors' actions.
- Persuasive framing (Section 2): "we argue" and "we believe" in 0906.2569, 1608.04644, 1810.04805; priority phrases in 20 of 51.
- Overused words (Section 4): "crucial" or "crucially" in 12 documents (for example 0909.0948, 2212.04356, 1810.04805, 2103.00020); hype words in 33 of 51.
- Origin statements (Section 6): 7 documents state companion papers, earlier versions or release context (1502.01583, 1609.04153, 1212.5226, 1506.01497, 1502.00956, cond-mat/0308217, 1709.10010). In a journal introduction this is conventional, so the house rule conflicts with the genre here.
- Negative parallelism (Section 4): "not just ... but", "not only ... but also", "rather than" in 1409.4842, 0909.0948, 0802.1189.
- Conversational headings (Section 2): question headings in 0805.4471 and "A puzzling numerical experiment" in math/0409186; exclamation marks in math/0409186 and 1410.3012.
- Undefined abbreviations (Section 5): 1610.05820, 1305.3347, 1707.00027.

Not verified: the move coding, the information-flow judgement and the "impression" items were done by one reader without a second coder; the regular-expression counts include some false matches (for example "the first" in a non-priority sense).
