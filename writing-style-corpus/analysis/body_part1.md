# Body sections and letter texts, bundle part 1

## Material and counting method

The bundle holds 44 blocks: 6 astrophysics, 7 computer science and EESS, 6 condensed matter, 7 machine learning, 6 mathematics and statistics, 7 physics (other), 5 quantitative biology. Five blocks contain only acknowledgements, funding, availability or contact lines (1105.0828, 1410.3012, 1203.6372, 1708.01492, q-bio/0402017) and are excluded. The remaining 39 blocks (51 468 words) were read in full. Each block is cut at about 1500 words, so the counts describe the first 1500 words of the body text, not whole papers. Paragraph breaks survive in 10 blocks only (1607.00653, 2105.05537, 2010.11929, cond-mat/0408187, 1201.0490, 1409.1556, 1003.1594, 0706.0456, 0803.0476, 1305.3347); elsewhere the extraction joins the text into one line, and paragraph structure is inferred from subsection markers and topic shifts.

The 39 blocks fall into six kinds, assigned by reading: method or model description with derivation (11: 1001.4538, astro-ph/0409513, 1610.05820, 1409.1556, 1412.6980, 1506.01497, 1603.02754, 1705.07874, 1003.1594, 1507.04544, 2308.04079), proofs (4: 0912.3599, 0803.2392, math/0409186, math/0503066), results and parameter analyses (6: 0708.1752, 1212.5226, 1502.01583, 0706.0456, hep-ph/0201195, 0803.0476), letters without section headings (8: 0803.1670, 0905.1712, 1005.4917, cond-mat/0008064, cond-mat/0509330, 1803.07355, physics/0508025, 1501.01455 as an article whose headings were lost), related-work sections (4: 1502.00956, 1607.00653, 2105.05537, 2010.11929), and software descriptions (6: 2206.14220, 1201.0490, 1111.6097, 1305.3347, cond-mat/0408187 as an application section, 1207.0203 as a vision article).

Three kinds of evidence are kept apart below. "Counted" means a regular-expression count over the 39 blocks, checked against the text. "Tallied" means a count made while reading. "Impression" marks a judgement that was not counted. Corpus-wide medians come from `analysis/metrics_summary.csv` (paper body, n = 35 units, median with interquartile range in brackets).

## 1. Structure

Letters follow one sequence of moves. Tallied over the 7 letters with a clear move structure (0803.1670, 0905.1712, 1005.4917, cond-mat/0008064, cond-mat/0509330, 1803.07355, physics/0508025), all 7 run: established knowledge of the field, a named limitation or open question, a "here we report" or "in this paper we" statement, the method in a few sentences, an observation tied to a figure, a quantification with a baseline, and a physical explanation of the observation. In 6 of 7 the explanation is a causal chain written as prose (the seventh, physics/0508025, uses a simple algebraic model instead). In 5 of 7 the letter returns to the explanation more than once, one observation at a time: observation, number, mechanism, then the next observation (cond-mat/0008064, cond-mat/0509330, 1005.4917, 1803.07355, 0905.1712).

Constructed example: "The outlet temperature rises by 12 K when the coolant flow is halved. The rise is twice the value predicted by the plug-flow model. The extra rise comes from back-mixing near the inlet, which moves the hot spot upstream."

Method sections follow a different sequence. Tallied over the 11 method blocks, 9 open with a roadmap or purpose sentence (all except 1003.1594 and 1705.07874, which open with a background story and a property claim). Then come, in order: the objects and their symbols (11 of 11), the construction or update rule step by step (11 of 11), a property or consequence of the construction (10 of 11; 1003.1594 asserts properties without deriving them), and a comparison with a named earlier method (9 of 11: astro-ph/0409513, 1409.1556, 1506.01497, 1603.02754, 1705.07874, 1507.04544, 2308.04079, 1610.05820, 1003.1594).

Proof sections (4 of 4) state the claim, reduce it to a sufficient condition ("it suffices to", counted in 3 of 4: 0912.3599, 0803.2392, math/0409186), prove each part in labelled steps, and close with a one-sentence end marker.

Related-work sections (4 of 4) group earlier work by approach, give each group its limitation, and end each group with how the present work differs (1607.00653, 2010.11929, 2105.05537, 1502.00956).

Length: corpus medians are 148 sentences [106, 345] and 3840 words per body unit, with mean paragraph length 129 words [94.7, 204]. In the 10 blocks with paragraph breaks, paragraphs run from 2 to 9 sentences (impression: most are 4 to 6).

## 2. Paragraphs

Openings. In the 10 blocks with paragraph breaks, tallied, most paragraphs open with a sentence whose subject is the topic of the paragraph: a data set (0706.0456, 4 of 9 paragraphs), a method family (2010.11929, 1607.00653), or a problem (2010.11929, second paragraph). In flattened blocks, subsection starts behave the same way: the first sentence names the object of the subsection as grammatical subject (1502.01583, 0708.1752, 1506.01497).

Development. The body of a paragraph moves from general to particular: claim, mechanism, number. Impression: the strongest paragraphs (cond-mat/0008064, 1005.4917, cond-mat/0509330) never hold two observations; each paragraph treats one measurement or one effect.

Closings. Tallied in the same 10 blocks, paragraphs close in one of three ways: a decision taken because of the evidence (0706.0456 closes three paragraphs this way), a contrast with the present work (1607.00653, 2010.11929, 2105.05537), or a number (0803.0476, cond-mat/0408187).

Constructed example of a decision close: "The two data sets disagree above 450 K, where the older data set used a different thermocouple. The model is therefore fitted only to data below 450 K."

Hand-over. The next paragraph usually picks up a noun from the previous one, or opens with a sequence word. "Finally" or "Next" opens the last paragraph of a series in 0706.0456, 1201.0490 and 0803.2392. Impression: explicit transitional sentences between paragraphs are rare; the repeated noun does the work.

## 3. Sentences

Length and rhythm. The corpus median sentence length is 22.8 words [21.4, 24.8], with a standard deviation of 13.8 words [12.3, 20.4] and a coefficient of variation of 0.625 [0.555, 0.703]. Sentences over 40 words make up 8.5 % [6.8, 10.8]. The spread is wide: long sentences that carry a definition or a chain of causes sit next to short sentences that state a result. The short-result sentence after a long setup sentence was tallied in 9 blocks (cond-mat/0008064, cond-mat/0509330, 1005.4917, 1409.1556, 2308.04079, 0803.2392, 1001.4538, 1603.02754, math/0409186).

Constructed example: "With the inlet held at 300 K and the wall heated uniformly along the full 2 m length, the Nusselt number reaches its fully developed value after about 0.3 m. Beyond that point it stays constant."

Information flow. Impression, consistent across the letters and method blocks: known information sits in the subject, often as "this" or "these" plus a noun, and new information (a number, a cause, a name) takes the final position. Counted: "this" or "these" followed by a noun occurs 148 times in 36 of 39 blocks.

Constructed example: "This temperature rise is caused by back-mixing near the inlet."

Openers. Sentence-initial connectives make up 8.3 % of sentences (corpus median, [6.3, 11.4]). Counted over the 39 blocks: "thus", "hence", "therefore", "consequently" or "as a result" occur in 30 blocks (94 times); "however" in 26 blocks (46 times); a contrast marker ("in contrast", "on the other hand", "unlike", "conversely") in 18 blocks (29 times); "first", "second", "finally" as sentence openers in 12 blocks (22 times). "Note that" opens a sentence or clause in 16 blocks (32 times), most often in proofs and derivations (0912.3599, 1001.4538, cond-mat/0509330: 4 each).

"We" and voice. The corpus median is 7.7 occurrences of we, our or us per 1000 words [3.7, 12.5], and 25.8 % of sentences contain a passive [20.9, 30.2]. Voice divides by task, tallied by reading:

- "We" carries choices and inferences: "we use", "we choose", "we assume", "we find", "we conclude". "We" with a verb of finding (find, obtain, observe, conclude, show, detect, measure) was counted in 19 blocks, for example 1001.4538 (8 times), cond-mat/0008064 (5 times), 0706.0456 (3 times).
- The passive carries fabrication, measurement and data handling, where the agent does not matter. A past passive with a procedure verb was counted in 12 blocks; it is densest in experimental sections (0803.1670, 7; 1610.05820, 6; math/0503066, 6; 1803.07355, 5).
- Instrument and data-processing papers write almost wholly in the passive and the present tense (0708.1752 has no "we" in 1500 words; 1502.01583 has 7).
- Proofs use the imperative for steps of an argument: "substitute", "combine", "invoke", "observe". Counted in 4 blocks (0803.2392, 17; math/0409186, 13; 0912.3599, 9; math/0503066, 3).

Constructed example of the division: "The tubes were cleaned with dilute acid and dried at 380 K. We chose this temperature because the coating softens above 400 K."

Single-author first person "I" occurs in one block (physics/0508025, 6 times). Second person occurs in one block, a user manual (1111.6097, 7 times).

## 4. Claims and evidence

Numbers. Counted, a number with a unit or a percentage occurs in 18 blocks (118 times); the dense ones are experimental (1005.4917, 20; 1502.01583, 18; 0905.1712, 17). A stated comparison (factor, "times larger", "order of magnitude", "compared with", "than") occurs in 32 blocks (130 times). Tallied by reading, 16 blocks state a key number together with its baseline in the same sentence or the next: an earlier substrate, an earlier release, a reference implementation or a theory value (1005.4917, 1502.01583, 1212.5226, cond-mat/0509330, 0905.1712, 0803.0476, 1201.0490, 1603.02754, math/0503066, 0706.0456, hep-ph/0201195, 1506.01497, 1409.1556, 0708.1752, 1803.07355, cond-mat/0008064).

Constructed example: "The heat-transfer coefficient is 840 W/(m² K), three times the value for the smooth tube at the same Reynolds number."

Uncertainty. Tallied, 9 blocks give an uncertainty with the result (a ± value, a confidence level, a significance in standard deviations, a p-value, or an upper bound): 1212.5226, 1502.01583, cond-mat/0509330, 0706.0456, hep-ph/0201195, 1001.4538, 1005.4917, 1501.01455, 0708.1752. Machine-learning and software blocks report timings and parameter counts as point values with no spread (1201.0490, 1603.02754, 1506.01497, 0803.0476).

Placement of hedges. The corpus median is 3.15 hedge words per 1000 words [2.11, 5.14]; counted, a hedge occurs in 33 of 39 blocks. Tallied by reading, hedges sit on causes and on generalisation, not on measured values. In 8 blocks the measured number is stated flatly and the mechanism behind it is hedged (0708.1752, 0905.1712, 1005.4917, 0706.0456, 0803.0476, cond-mat/0408187, cond-mat/0509330, 1212.5226). Proofs hedge only heuristic remarks (math/0409186, 0803.2392).

Constructed example: "The pressure drop rose by 18 % over 40 h. Fouling of the first tube row is the likely cause, since the rise stopped after that row was cleaned."

Boosters. Counted, an intensifier or evaluative adjective ("clearly", "drastically", "surprising", "excellent", "ideal", "perfect", "unprecedented" and similar) occurs in 30 blocks (108 times). By reading, the strong letters put intensifiers on contrasts that the data support at once (cond-mat/0008064, cond-mat/0509330), while the weaker blocks put them on their own method or on other people's work without evidence (2308.04079, 14; 0803.1670, 10; 1207.0203, 7; 1502.00956, 5; 1003.1594). Section 8 returns to this.

## 5. Terms and definitions

Symbols. Counted, a "where" clause that defines symbols right after an equation occurs in 20 blocks (59 times; for example 0912.3599, 13; 1507.04544, 7; 1705.07874, 6). The symbol is defined once and then used bare. In the letters the definition is folded into the sentence that first uses the symbol, as an apposition (1005.4917, cond-mat/0509330).

Constructed example: "The Biot number Bi, the ratio of internal conduction resistance to surface convection resistance, is below 0.1 for all particles. For Bi below 0.1 the particle temperature is uniform to within 5 %."

Names for new objects. Tallied, 9 blocks introduce a coined name with an explicit naming verb ("which we call", "referred to as", "named", "was named", "we will refer to these as"): 1506.01497, astro-ph/0409513, cond-mat/0008064, 1610.05820, 1412.6980, 1603.02754, 1201.0490, 1501.01455, 1705.07874. The pattern is description first, name second. In 1705.07874 each property is named in a short sentence and then defined in the next one.

Constructed example: "Each tube row is split into sections of equal heat duty, which we call duty cells. A duty cell ends where the cumulative duty reaches one tenth of the total."

Definitions by operation. Tallied, 6 blocks define a computed quantity by the procedure that produces it: a fraction of what over what, an average of what over which set, a sum of which parts (1610.05820, cond-mat/0008064, 1507.04544, physics/0508025, 0803.0476, 1502.01583).

Abbreviations are expanded in parentheses at first use in most blocks (impression; examples 1502.01583, 1005.4917, 0803.1670, 1506.01497). Re-expansion of the same abbreviation later in the text was seen in 2 blocks (1502.01583, 1501.01455).

## 6. Connectives and cohesion

Cohesion rests mainly on repeated nouns, not on connectives. Counted, "this" or "these" plus a noun occurs in 36 of 39 blocks (148 times), against 46 bare "this" or "these" plus verb openers in 27 blocks; the corpus median share of bare "This/These + verb" openers is only 2.0 % of sentences [1.2, 3.1]. The strongest letters (cond-mat/0008064, cond-mat/0509330) repeat a noun with the same sentence frame for parallel findings: the behaviour of one network is explained, then the behaviour of the other is explained in the same grammatical shape (impression, tallied in these 2 blocks and in 1005.4917 for the two graphene samples).

Constructed example: "This fouling resistance is rooted in the low wall shear stress of the laminar section. The lower resistance of the turbulent section is rooted in its higher shear stress."

Causal links are dense. Counted, a causal marker ("because", "since", "due to", "is rooted in") occurs in 34 of 39 blocks. Proofs chain "since ..., we have ..." or "this gives" sentence after sentence (0912.3599, 0803.2392, math/0409186, math/0503066).

Signposts. A roadmap phrase ("in this section", "here we", "we first", "we now", "we begin") occurs in 18 blocks (40 times), mostly at subsection starts. Rhetorical questions that set up an explanation occur in 3 blocks (1001.4538, 1409.1556, physics/0508025), each followed at once by the answer.

Constructed example: "Why does a thinner wall give a lower outlet temperature? A thinner wall stores less heat, so the wall cools faster when the coolant flow rises."

## 7. Differences between groups

Mathematics and statistics, and the proof sections in computer science (0803.2392, math/0409186, math/0503066, 0912.3599): first-person plural with imperatives for argument steps, "it suffices", "note that", one-sentence end markers, short sentences (impression; 0912.3599 and 0803.2392 have the highest share of short sentences in the bundle by a rough sentence split). 1507.04544 differs: it is a procedure section with numbered imperative steps and stated thresholds for each diagnostic.

Astrophysics and particle physics collaboration papers (1212.5226, 1502.01583, 0708.1752, 0706.0456, hep-ph/0201195): the most uncertainty markers (1212.5226, 44 counted; hep-ph/0201195, 24; 0706.0456, 13), long sentences, much passive, and parameter decisions justified by data tension.

Condensed-matter and atomic physics letters (1005.4917, cond-mat/0509330, 0905.1712, 0803.1670, 1803.07355): the most numbers with units, flat statements of measured values, hedged mechanisms, and a chronological account of fabrication in the passive.

Machine learning and computer vision (1409.1556, 1506.01497, 1603.02754, 1705.07874, 2308.04079, 1502.00956, 2105.05537, 2010.11929): "our method" contrasts (counted in 12 blocks overall, 7 times each in 1502.00956 and 1506.01497), author-led citation sentences ("X et al. [CITE] proposed", counted in 9 blocks, 13 times in 1502.00956), parameter counts and speed as evidence, and almost no stated uncertainty.

Software papers (2206.14220, 1201.0490, 1111.6097, 1305.3347): run-in labels in place of headings, design goals stated as intentions ("we strive", "we aim"), and second person in the user manual.

Quantitative biology contributes only one substantive block (1501.01455), so no group pattern is claimed for it.

## 8. Weak patterns

The following habits occur in the bundle and hurt readability. They are not to be copied.

1. Promotional adjectives on the authors' own work or on the subject. Tallied in 6 blocks: 1003.1594 (birds described as fascinating and their timing as amazing), 1207.0203 (revolutionary, radical evolution), 2308.04079 (outstanding, excellent), 1502.00956 (excellent works, elegantly), 0803.1670 (perfect, ideal), 0803.0476 (unprecedented sizes).
2. Unsourced or vague attribution. "Studies show" without a citation occurs twice in 1003.1594; 1207.0203 gives a forecast of device numbers with only an organisation name as source.
3. Filler announcements. "It is worth noting", "it is interesting to note", "it should be noted", "interestingly": counted in 7 blocks, 11 times (0803.0476 and 1502.01583, 2 each; 1501.01455, 3). Removing the phrase loses nothing in each case checked.
4. Advantages claimed without a derivation or a test. 1003.1594 lists three advantages over two other algorithms with no evidence; physics/0508025 lists advantages and disadvantages of rival indices in a label-and-colon form.
5. Overused words from the house list. "Key", "crucial", "novel", "robust", "highlight", "enhance", "leverage", "intricate" were counted in 20 blocks (47 times); densest in 1501.01455 (8), 2308.04079 (7) and 1502.00956 (4).
6. Paragraphs that list prior methods without a claim. 2105.05537 strings method names with "such as" and closes on "tremendous success"; the reader learns the names but not the limitation that motivates the work. Compare 2010.11929, which gives each method family its cost or limitation.
7. Run-on sentences that join independent findings with commas or semicolons (impression; 2308.04079 has 11 semicolons in 1500 words, 1207.0203 has 10).
8. Extraction artefacts that are not style (tracked-change residues in 2308.04079, lost headings in 1207.0203 and 1501.01455, stripped package names in 2206.14220). These were ignored in all counts above except word totals.

## 9. Comparison with the house rules

Rules the strong texts follow:

- Definition of every symbol at or before first use (Section 5 of the house rules). Followed by the "where" clause pattern in 20 blocks; the letters 1005.4917 and cond-mat/0509330 define each symbol in the sentence that introduces it.
- Quantitative, specific wording (Section 3) and quantities defined by what is computed and how (Section 7). Followed in 1610.05820, cond-mat/0008064, 1507.04544 and physics/0508025, which define precision and recall, network diameter, the leave-one-out estimate and the index by their procedures.
- Every derivation step shown with its physical meaning (Section 7). Followed in cond-mat/0509330 (from two semiclassical relations to the linear dispersion), 1603.02754 (from the second-order expansion to the split score), 2308.04079 (from volume rendering to alpha blending) and 1001.4538 (from potential well to polarization sign).
- Abbreviation next to its full form (Section 5). Followed in 1502.01583, 1005.4917, 0803.1670 and 1506.01497.
- Equations numbered and referred to in the text (Section 9). Followed wherever equations survive (1603.02754, 1705.07874, 1507.04544, 2308.04079).
- Low em-dash use (Section 4). The corpus median is 0 em dashes per 1000 words [0, 0].
- Citation for modelling choices (Section 8). Followed in 1507.04544, which cites the log score, the Pareto fit and each prior diagnostic.
- Honesty about scope and uncertainty (Section 2). Followed in 1212.5226 and 0706.0456, which call non-significant results non-significant and say which data were excluded and why.

Rules the texts break:

- No promotional wording and no vague attribution (Section 4). Broken in 1003.1594, 1207.0203, 2308.04079, 1502.00956 and 0803.1670.
- No filler such as "it is worth noting" (Section 4). Broken in 7 blocks, including 1502.01583, 0803.0476, 1501.01455 and 1409.1556.
- Low density of the overused word set (Section 4). Broken in 1501.01455, 2308.04079 and 1502.00956.
- No negative parallelism of the "X rather than Y" form (Section 4). "Rather than", "not only" or "not just" was counted in 10 blocks. In 0905.1712, cond-mat/0509330 and 1803.07355 the form states a real experimental contrast (two candidate mechanisms, maxima against minima), so the strong texts break the rule where the contrast is the finding; the rule fits the decorative cases in 1207.0203 and 1501.01455 better.
- No "Term: description" list as the default form (Section 4). Broken in 1201.0490, physics/0508025 and 1111.6097, which use run-in labels for parallel items.
- No second-person asides (Section 2). Broken only in the manual 1111.6097.
- No conversational framing (Section 2). Rhetorical questions appear in 1001.4538, 1409.1556 and physics/0508025. In each case the question is answered in the next sentence and sets up a mechanism, so these are signposts; the house rules do not address them directly.
- Impersonal register (Section 2). The strong texts use "we" at 7.7 per 1000 words (median) for choices and inferences, and the imperative in proofs. The house rules do not forbid "we", but the strong texts are less impersonal than the rule's examples suggest.
- Bare "This" openers (only restricted by the STE100 dial at 100 %, Section 12). Present in 27 blocks but at a low rate (2.0 % of sentences, corpus median); the strong texts mostly attach a noun.

Not verified: the move sequence for whole papers (blocks stop at about 1500 words), paragraph structure in the 29 flattened blocks, and the exact passive share per block (the corpus figure comes from `metrics.py`; the per-block estimates used for orientation here came from a rougher pattern match and are not reported).
