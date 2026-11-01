# Conclusion and summary sections of highly cited STEM papers

## Corpus and counting basis

The bundle holds 72 conclusion, summary or outlook sections. By group: astrophysics 13, computer science and EESS (other) 17, condensed matter 6, machine learning 17, mathematics and statistics 5, physics (other) 10, quantitative biology 4. All 72 were read in full. Seven blocks are cut at about 1500 words by the bundle (0803.0547, 1001.4538, 1609.04153, astro-ph/0009005, cond-mat/0106096, 0906.0612, 1410.3012). In the same seven, the paragraph breaks were lost in extraction, so paragraph counts for them are not reliable. Eight blocks are not conclusions in the usual sense: they are summaries of analysis changes, feature inventories or scope statements (0803.0547, 1001.4538, astro-ph/0009005, 0710.3820, 1410.3012, 1801.00862, hep-ph/0603175, 0906.2569). They are counted with the rest unless stated otherwise.

Acknowledgement or funding text sits inside 34 of the 72 blocks (for example 0909.0948, 1212.5226, 1706.03762, cond-mat/0308217, hep-ph/0201195). The measured features in `metrics_summary.csv` were probably computed on these blocks as they stand. If so, "We thank" sentences raise the rate of first-person plural pronouns per 1000 words (`we_per_kw`), and lists of grant numbers raise the parenthesis rate. This was not checked against `metrics.py` input handling. The per-document counts below come from a reading of the text before the acknowledgements, plus a crude script (regular-expression sentence split, hedge list from `metrics.py`) used only for short-sentence and hedge counts.

The conclusion row of the summary table (median [interquartile range], n = 72): 240 [178, 770] words; 11 [7, 28] sentences; 22.8 [20.7, 27.1] words per sentence; coefficient of variation of sentence length 0.399 [0.316, 0.532]; share of sentences over 40 words 0.042 [0, 0.123]; passive share 0.25 [0.143, 0.371]; we/our/us 18.6 [6.61, 28.1] per 1000 words; hedges 3.36 [0, 6.75] per 1000 words; connective-opened sentences 0.055 [0, 0.129]; bare "This/These + verb" openers 0 [0, 0.026]; 89.5 [56.8, 115] words per paragraph; em dashes 0; semicolons 0 [0, 1.28] per 1000 words; parentheses 4.79 [0, 13.2] per 1000 words; citations per sentence 0 [0, 0.165]; nominalisations 54.5 [39, 72.3] per 1000 words.

## 1. Structure

### Opening move

Counted:

- Recap of the work, with "we", "this paper" or "this work" as subject: 39 of 72 (for example 1706.03762, 1502.03167, cond-mat/0408187, 1509.06555, 0803.0476). Tense of the recap verb: present perfect ("we have presented", "we have described", "we have introduced") in 22 (1212.5226, 1609.02907, 2010.11929, 1003.1594); simple past in 11 (1105.1186, 1607.00653, 1409.1556, 1608.06993); present in 6 (1102.1523, 1403.6652, 2304.03442, 1207.7235). The frame "In this paper/work" comes first in 11 (1607.00653, 2105.05537, 1409.0575, hep-ph/0201195), and "This paper presented/introduces/describes" in 4 more (1105.1186, 1609.03499, 2304.03442, 1709.10010).
- Context or problem statement first, contribution second: 11 of 72 (0708.1752, 1608.04644, 1705.07874, 1810.04805, 1406.5823, 0802.1189, q-bio/0402017).
- The tool or method as subject, in a defining sentence: 11 of 72 (1009.1622, 1201.0490, 1303.3997, 1409.7208, 1105.0828, 1411.4038).
- A result or comparison first: 2 (1409.4842, 0709.3906). A claim of significance first: 1 (1512.03012).
- Non-standard openers (scope statement, list of points covered, analysis changes): the 8 blocks named above.

Constructed example (recap opener): "We have presented a finite-volume model of conjugate heat transfer in a finned tube and tested it against measured wall temperatures."

### Sequence of moves

Among the 64 standard conclusions, the usual order is recap, main result, comparison with prior methods, then limitation or future work. Counted moves:

- Future work or outlook: 39 of 72 (1105.1186, 1502.03167, 2010.11929, 0803.0476, hep-ph/0201195). In 33 of these 39 it is the last content move before the acknowledgements. The exceptions are 0708.1752, 2308.04079, 1709.10010 and 1801.00862, which end on a claim, a restatement or an appeal, and the truncated cond-mat/0106096 and 0906.0612.
- An explicit limitation of the authors' own work: 20 of 72 (0803.0476, cond-mat/0308217, 2010.11929, 0709.3906, 1405.0301, hep-ph/0201195). In machine learning this is 3 of 17 (1409.0575, 2010.11929, 2103.00020). In computer science it is 2 of 17 (1502.00956, 2308.04079).
- Comparison with named prior methods or results: in most standard conclusions. This was not counted exactly; see Section 4 for the comparison claims that were counted.

The typical short form (machine learning, computer science) has three moves: recap with an appositive definition of the method, one or two result claims against the state of the art, and one future-work sentence. Examples are 1706.03762, 1609.02907, 1506.01497 and 1608.06993. The long form (astrophysics, physics, reviews) adds headed subsections: 9 of 72 have them (0909.0948, 1502.01583, 1502.00956, 1409.0575, 0710.3820, 0803.0547, 1001.4538, cond-mat/0106096, 1410.3012). A "Future issues", "Future work" or "The future" subsection appears in 0909.0948, 1502.00956 and 1409.0575.

### Length

Median 240 words and 11 sentences (metrics row). Word counts before the acknowledgements, from the script, differ by group. Medians: machine learning about 107 words (n = 17), computer science about 175 (n = 17), astrophysics about 450 (n = 13), physics about 600 (n = 10). The shortest are 2–3 sentences: 1411.4038, 2212.04356, 1810.04805, 2105.05537. Seventeen standard conclusions are one paragraph long (1609.03499, 1810.04805, 1506.01497, 1207.7235, cond-mat/0408187, 1303.3997).

## 2. Paragraphs

Opening. In the multi-paragraph conclusions, a paragraph usually opens with a topic sentence that names one contribution or one result. In 1509.06555, five of six content paragraphs open with "We have" plus a verb of reporting ("performed", "demonstrated", "presented"). cond-mat/0308217, 1610.06475 and 1502.03167 open each paragraph on a new aspect: method, demonstration, limitation, use by others. Constructed example: "The second contribution is a correlation for the fin efficiency of tapered fins."

Development. Two to four sentences then give the mechanism or the evidence. A frequent internal order is claim, reason, consequence. In 1502.03167 the first paragraph runs premise, mechanism, implementation detail, then properties of the trained networks. In 0709.3906 each paragraph starts from one comparison ("Relative to …") and gives the reason the new method avoids the failure.

Closing. Paragraphs end on either an implication or a short evaluative sentence. Implication closers: 0708.1752 (what the improvement makes possible), 1610.05820 (practical privacy implications), 1003.1466 (topics for further research). Short evaluative closers: cond-mat/0308217 (without the recalculation step the algorithms fail), 0709.3906 (the new method removes the issue), 2010.11929 (further scaling would likely help). Constructed example: "Without the radiation term, the model under-predicts the wall temperature by about 40 K."

Hand-over. Counted devices:

- Ordinal or numbered enumeration in prose (First, Second, Finally; (i), (ii); I, II, III): 12 of 72 (1105.1186, 1502.01583, 0803.0476, 1409.0575, cond-mat/0308217, 2010.11929, hep-ph/0603175, 1406.5823, 1509.06555, astro-ph/0009005, 0906.0612, hep-ph/0201195).
- Bullet lists or labelled paragraphs: 7 of 72 (1307.6212, 1608.04644, 0709.3906, 1801.00862, hep-ph/0603175, 1410.3012, 1512.03012).
- Otherwise the next paragraph repeats the method name or an "our" + noun phrase from the previous one. This was observed in 1610.06475, 1502.00956 and cond-mat/0408187; it is an impression and was not counted across all documents.

## 3. Sentences

Length and rhythm. The median sentence has 22.8 words, and only 4 % of sentences exceed 40 words. The spread of sentence length (coefficient of variation 0.399) is lower than in the full paper body (0.625) and in introductions (0.466). Conclusions therefore have a more even rhythm than other sections. The crude script found at least one sentence of eight words or fewer in 24 of 72 documents (1403.6652, 1607.00653, 1610.05820, cond-mat/0308217, 0709.3906). Where these occur they follow a long sentence and state a short judgement. Constructed example: "The catalyst bed reaches steady state after 20 min of operation at 450 K, once the inlet temperature has been raised in three steps. The hot spot does not move."

Subject position. The subject holds known material: "we" (recap and claim sentences), the method name, or "our" + method/approach/results. Named-method subjects in two or more sentences were counted in 12 of 72 (1609.03499, 1610.06475, 1502.03167, 1409.7208, 1105.0828, 1608.06993). "Our" + noun subjects occur in cond-mat/0408187 (three times), 1610.05820, 1502.00956, 2308.04079 and 1003.1466.

Final stress position. In claim sentences this position holds the comparison baseline or the application domain. In the measurement-heavy papers it holds a number with its confidence level (1212.5226, 1207.7235, 1509.06555). Constructed example: "The new sort routine runs in linear time on nearly sorted input, about four times faster than the standard library merge sort."

"We" and voice. First-person plural is used in 61 of 72 documents. The median rate is 18.6 per 1000 words, against 10.6 in introductions and 12.8 in discussions. Part of this difference may come from acknowledgement text (see the counting basis). Eleven documents have no first person before the acknowledgements: 0708.1752, 1009.1622, 1609.04153, astro-ph/0409513, astro-ph/0009005, 1105.1186, 1201.0490, 1207.7235, 1303.3997, 1409.7208, 1411.4038. Only 1801.00862 uses "I". Active "we" carries recap and claim sentences. The passive (median share 0.25) carries three uses:

- instrument and procedure facts (1502.01583, 1001.4538);
- reports of collaboration results (1207.7235, where results are presented, an excess is observed and the search is performed);
- proofs stated impersonally (1105.1186, where it is shown and proven).

Constructed example: "The tube bank was tested at five Reynolds numbers between 2000 and 10 000."

Openers. Connective openers are rare (median 0.055 of sentences, against 0.089 in discussions). Bare "This/These" + verb openers have a median of 0. The usual sentence starts with its subject.

## 4. Claims and evidence

Numbers. At least one quantitative result appears in 23 of 72 conclusions (0708.1752, 1212.5226, 1509.06555, 1207.7235, 0803.0476, 1409.7208). The share differs by group: 9 of 13 in astrophysics against 3 of 17 in machine learning (1409.0575, 1409.1556, 1505.04597). A result with a stated uncertainty, confidence level or significance appears in 7 (0803.0547, 1001.4538, 1212.5226, 1509.06555, 1502.01583, 1207.7235, hep-ph/0201195). In these papers the claim, the number and the confidence level stand in one sentence, and the comparison with the expected value or an earlier release follows in the next. Constructed example: "The fitted heat-transfer coefficient is 410 ± 25 W m⁻² K⁻¹ (68 % confidence level), within 6 % of the Dittus–Boelter value."

Comparisons without numbers. Eighteen conclusions claim superiority ("outperforms", "state of the art", "superior", "fastest") and give no figure in the conclusion: 9 of 17 in machine learning (1502.03167, 1609.02907, 1706.03762, 2010.11929), 5 in computer science (1403.6652, 1706.02216), 3 in mathematics and statistics (1003.1466, 1003.1594, 1105.0828) and 1303.3997. The baseline is named in some (1105.0828 names k-nearest-neighbour imputation; 1003.1594 names genetic algorithms and particle swarm optimisation). In others the baseline is only "existing methods".

Hedging. 34 of 72 conclusions contain none of the hedge words in the `metrics.py` list (1706.03762, 1212.5226, 1207.7235, 1609.03499, hep-ph/0201195). The median rate, 3.36 per 1000 words, is half the discussion rate (6.89). Hedges concentrate in two places. The first is future-work sentences (1502.03167, 1608.06993, 2010.11929). The second is reviews and perspectives: 1801.00862 has 11 hedge words, 0906.0612 and astro-ph/0009005 have 8 each, 0709.3906 has 7, and 0802.1189 and cond-mat/0106096 have 6 each. Result sentences about the authors' own method are mostly unhedged. Strong evaluative words appear without hedges in 1502.00956 ("most reliable and complete"), 1505.04597 ("We are sure") and 1512.03012 ("We firmly believe"). The counter-pattern is careful scoping: 0802.1189 qualifies a claim to the examples tested so far, and 0803.0476 states which hierarchy levels were and were not verified. Constructed example: "Tests so far cover tube banks with up to ten rows; deeper banks were not examined."

## 5. Terms and definitions

Conclusions mostly reuse names defined earlier in the paper. Two definition forms were counted:

- An appositive or copular gloss on the method or tool name at its first mention in the conclusion: 11 of 72 (1609.03499, 1307.6212, 1603.04467, 1603.02754, 1706.03762, 2304.03442, 1506.02640, cond-mat/0308217, 1009.1622, astro-ph/0409513, 1303.3997). Constructed example: "We have presented TubeSolve, a finite-volume code for conjugate heat transfer in tube banks."
- An acronym used without expansion at its first use in the conclusion: at least 11 (1506.01497, 1502.00956, 0709.3906, 1207.7235, 0909.0948, 1509.06555, hep-ph/0201195, 1405.0301, 1610.06475, 1607.00653, 1003.1466).

Re-expansion of acronyms happens mainly in the long analysis summaries (0803.0547, 1001.4538, 1502.01583, 1410.3012). Only 0803.4060 coins a new term in the conclusion itself, and it marks the coinage explicitly. After the first mention, the method name is repeated unchanged, with no synonyms (1609.03499 repeats "WaveNets"; 1409.7208 repeats "MEGAHIT").

## 6. Connectives and cohesion

Cohesion rests mainly on repeating the method name or the "our" + noun phrase, which is an impression supported by the subject counts in Section 3. The second device is "This/These" + noun at a sentence start, which picks up the previous claim; examples are in 1403.6652, cond-mat/0308217, 1502.01583 and 0803.4060. Explicit connectives open about one sentence in 18 (median 0.055). The ones observed are "Finally" (closing an enumeration or a list of future directions: 1105.1186, 1609.03499, 2010.11929), "In addition", "Furthermore" and "Moreover" (adding a property: 1003.1594, 1105.0828, 1610.06475), and "However" (turning to a limitation: cond-mat/0308217, 0709.3906, 1409.0575). Citations are almost absent (median 0 per sentence, against 0.273 in introductions); the conclusion points back to sections ("Sect. [REF]") in 0909.0948, 1502.01583 and 2206.14220. Constructed example: "This correction removes the bias at low flow rates. However, it requires the wall temperature at each section."

## 7. Differences between groups

- Machine learning and computer science: shortest. Recap opener in 25 of 34. Comparison claims without numbers in 14 of 34. Limitations in 5 of 34. A single future-work sentence is the usual ending (1706.02216, 1608.06993, 1201.0490).
- Astrophysics and particle physics collaborations (WMAP, Planck, CMS): numbers with confidence levels, passive procedure sentences and comparisons with earlier data releases (1212.5226, 1502.01583, 1509.06555, 1207.7235). 1207.7235 has no first person at all.
- Software and code papers (1009.1622, 1307.6212, 2206.14220, 0906.2569, 1709.10010, 0710.3820, 1405.0301): feature inventories, product-as-subject sentences and plans stated with "will".
- Reviews and perspectives (0909.0948, cond-mat/0106096, 0906.0612, 1801.00862): longest, most hedged, with open questions and evaluative language.
- Quantitative biology (n = 4): short summaries; none of the four opens with a recap (1206.2332 and q-bio/0402017 place it in the second or third sentence).

## 8. Weak patterns

- Superiority claims with no figure and an unnamed baseline: 18 documents (Section 4).
- Promotional or emotive wording: 1512.03012 ("immensely", "pivotal"), 1603.04467 ("vibrant", "excited"), 1411.1607 (exclamation mark), 1009.1622 (a string of six adjectives for the libraries), 1003.1594 ("potentially powerful").
- A closing "In conclusion" sentence that repeats the first sentence: 2308.04079.
- Statements about the document's own origin or scope instead of content: 1801.00862, 0710.3820, 1410.3012, hep-ph/0603175.
- Unexpanded acronyms (Section 5) and data tables or reference lists mixed into the block (1001.4538, 1409.7208, astro-ph/0009005).
- Very long paragraphs in reviews (0906.0612, cond-mat/0106096) that combine several open questions in one block.
- Stock negative parallelism: 1405.0301 ("not just a plugin"), 1411.1607 ("more than just a language").

## 9. Comparison with the house rules

Rules the strong texts follow:

- Brevity and plain words (Section 3 of the rules): median 240 words, even sentence rhythm and few long sentences.
- Low em-dash and semicolon use (Section 4): both medians are 0.
- Term consistency (Section 4): method names are repeated, not varied (1609.03499, 1409.7208).
- Quantitative statements with uncertainty and conditions (Sections 2 and 9): 1212.5226, 1207.7235, 1509.06555, hep-ph/0201195.
- Scoping and separation of verified from unverified results (Section 2, "honesty over completeness"): 0803.0476, 0802.1189, cond-mat/0308217.
- Bullets only for parallel items (Section 6): 1307.6212 and 0709.3906 use them for parallel features or advantages.

Rules the texts break, or where the corpus practice differs:

- Impersonal register (Section 2): 61 of 72 use "we", at 18.6 per 1000 words. The rules ask for an impersonal register but do not forbid "we"; the corpus puts "we" in recap and claim sentences.
- Unsourced future outlook (Section 4): 39 of 72 have future-work content, and three have headed future subsections (0909.0948, 1502.00956, 1409.0575). In papers this content is about the authors' own planned work; the rule addresses speculative outlook about a field.
- Promotional wording and the overused-word list (Section 4): 1512.03012, 1603.04467, 1411.1607, 1009.1622.
- "In conclusion" restatement (Section 4): 2308.04079.
- Negative parallelism (Section 4): 1405.0301, 1411.1607.
- Origin and scope statements inside the document (Section 6): 1801.00862, 0710.3820, 1410.3012, hep-ph/0603175.
- Abbreviations defined at first use (Section 5): broken in at least 11 conclusions, although most of these acronyms are defined earlier in the full paper, which the bundle does not show.
- Quantitative wording where the subject allows it (Section 3): the 18 number-free superiority claims.
- Second-person asides (Section 2): broken only in 1801.00862, which addresses the reader directly. The measured rate of "you" is 0 across the row.
