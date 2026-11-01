# Introductions of highly cited STEM papers: bundle part 2

## Material and method

The bundle holds 51 introductions: astrophysics 9, computer science and EESS (other) 9, condensed matter 4, machine learning 9, mathematics and statistics 9, physics (other) 6, quantitative biology 5. All 51 were read in full. Ten blocks are cut at about 1500 words and have no paragraph breaks (1001.4538, astro-ph/0604561, 0912.3599, 1105.1186, 0709.3906, 0810.3286, math/0410542, math/0503066, 1111.6097, hep-ph/0603175). For these, nothing is known about the text after the cut, so counts of late moves (contribution, roadmap) are lower bounds. Several blocks are not research introductions: two reviews (astro-ph/0604561, cond-mat/0106096), lecture notes (1104.4345), a three-sentence database note (math/0312448), two program manuals (hep-ph/0603175, 0710.3820), an essay (1801.00862), and a results-first letter with no introduction heading (q-bio/0512013). Two blocks carry parameter tables from the extraction (0803.0547, 1001.4538); the tables are ignored here. Macro names are missing in some blocks (for example a sentence with an empty slot where a method name was), which is an extraction artefact, not a writing habit.

Counted items come from reading or from regular-expression counts over the bundle, checked by reading the hits. Items marked "impression" were not counted. The measured row for introductions in `metrics_summary.csv` (all 102 introductions, both halves; median and interquartile range) is:

| Feature | Introduction | Abstract | Results |
|---|---|---|---|
| Words | 831 [538, 1310] | 160 | 1410 |
| Sentences | 37.5 [22.8, 56.2] | 6 | 80 |
| Words per sentence, mean | 22.4 [20.7, 25.5] | 24.6 | 19.9 |
| Sentence-length spread, sent_cv | 0.466 [0.405, 0.54] | 0.35 | 0.505 |
| Share of sentences over 40 words | 0.067 [0.025, 0.118] | 0 | 0.043 |
| Passive share | 0.25 [0.173, 0.353] | 0.222 | 0.213 |
| we/our/us per 1000 words | 10.6 [4.88, 17.7] | 17.1 | 19.6 |
| Hedges per 1000 words | 3.95 [1.38, 6.65] | 0 | 3.48 |
| Sentences opening with a connective | 0.086 [0.039, 0.134] | 0 | 0.067 |
| Bare This/These + verb openers | 0.0115 [0, 0.038] | 0 | 0.021 |
| Words per paragraph | 94.2 [64.6, 126] | 142 | 87.4 |
| [CITE] per sentence | 0.273 [0.142, 0.415] | 0 | 0.097 |
| Nominalisations per 1000 words | 53.9 [42.1, 65] | 60 | 47.5 |

## 1. Structure

The dominant sequence is context, then gap, then contribution, then a preview of method or result, then (often) a roadmap.

- Context first: 44 of 51 open with field-level background. The seven that do not open with the problem itself (0912.3599, 1609.02907, math/0410542), with the paper's place in a series (1509.06555), or with the audience or occasion (math/0312448, 1104.4345, 1801.00862).
- Explicit gap or limitation of prior work before the contribution: 42 of 51. Absent in a data update (1001.4538), a review (astro-ph/0604561), the database note and lecture notes (math/0312448, 1104.4345), an applications article (1506.08498), the essay (1801.00862), and three short texts that state no deficiency (astro-ph/0006289, 1003.1594, 1409.1556).
- Explicit contribution statement: 47 of 51. Missing or deferred in 1105.1186 (cut before it), 0803.0476 (excerpt ends on the requirement), astro-ph/0409513 (a closing sentence defers the method to the next section), and q-bio/0512013 (results stated directly).
- Result preview inside the introduction: 29 of 51, of which 15 give numbers (0803.0547, 1001.4538, 1509.06555, astro-ph/0006289, 1607.00653, cond-mat/0408187, 1405.0312, 1506.02640, 1603.02754, 1706.03762, 2010.11929, 0810.3286, 1111.6097, 1708.01492, q-bio/0512013).
- Roadmap paragraph naming later sections: 20 of 51 (for example 0803.0547, 1509.06555, 1607.00653, 0803.4060, 1603.02754, 0810.3286, 1405.0301). Machine learning papers end on a roadmap in 4 of 9 (1409.1556, 1411.4038, 1603.02754, 1706.03762); five end on the result or on a code release.

A second pattern appears in tool and dataset papers (1307.6212, 2206.14220, 1512.03012, 1603.02754, 1411.1607, 0710.3820, 1111.6097, 1405.0301): history of the field or the code, then the design aim, then what the release contains. The gap here is a practical one (fragmented packages, slow code, an obsolete language).

Length varies by group (word counts of the blocks; cut blocks count as 1500): median about 530 words in machine learning, 340 in quantitative biology, 830 in astrophysics, 1170 in computer science. Paragraphs, where the breaks survive (35 blocks, 235 paragraphs), number 4 to 12 per introduction (impression from reading, not tallied per block).

Constructed example of the full sequence, compressed: "Shell-and-tube exchangers dominate heat recovery in refineries. Their design relies on correlations fitted to clean-tube data, which overpredict duty once fouling sets in. Here we derive a fouling-aware correction from 40 plant data sets and show that it halves the duty error. Section 2 gives the model, Section 3 the data."

## 2. Paragraphs

Opening. In the 235 paragraphs with breaks, about 168 (71 %) open with a noun-phrase subject that names the paragraph's topic, 27 (11 %) open with a connective, 14 with "In this paper" or "Here", 14 with "We" or "Our", and 12 with "This", "These" or "Such". Only 3 paragraphs open with "However" (1607.00653, 2010.11929, 2304.03442); the turn to the gap is more often placed inside the paragraph.

Development. A paragraph on prior work typically names one approach, states what it does, and ends on its limitation. This "method, merit, drawback" unit repeats method by method in 13 of 51 (0803.4060, 1105.1186, cond-mat/0408187, 1505.04597, 1206.2332, 0709.3906, 1111.4246, 0803.0476, 1303.3997, 1607.00653, 2105.05537, 1706.03762, 2010.11929). The drawbacks are concrete: a cost that scales badly, a tuning parameter, a missing conserved quantity, a size limit.

Constructed example: "The bubble sort is simple to code and needs no extra memory. Its cost, however, grows with the square of the list length, which rules it out above a few thousand items."

Closing and hand-over. Impression, supported by examples: the last sentence of a paragraph often states the open issue in a short clause, and the next paragraph picks that issue up as its subject. Examples are 1706.03762 (two consecutive paragraphs end on the remaining constraint), 1202.3665 (a cost judged unacceptable, then the problem visualised), cond-mat/0408187 (a size limit, then faster algorithms), 0803.4060 (a thermostat still widely used despite its defects, then the proposed method), 1509.06555 (a correlation hard to detect, then why it matters).

Constructed example of a hand-over: "... so the jacket alone cannot remove the heat at full load." / "Removing that heat at full load is the purpose of the internal coil described here."

## 3. Sentences

Length and rhythm. The measured mean is 22.4 words with a spread (sent_cv) of 0.47, and about one sentence in 15 exceeds 40 words. A rough split of this bundle (placeholders counted as words) gives the shortest means in 1506.02640, 1411.4038 and 2010.11929 (about 17–19 words) and the longest in 2206.14220, 1405.0301 and 2304.03442 (about 35–42). The short-sentence texts alternate a one-clause claim with a longer supporting sentence: 1506.02640 has 10 sentences of 10 words or fewer out of about 34; 1411.4038 sets one sentence per paragraph for most of its length.

Constructed example of the alternation: "The new mixer is fast. At a feed rate of 2 kg/s it reaches 95 % homogeneity in 4 s, against 11 s for the paddle design it replaces."

Information flow. Known material sits in the subject, new material at the end (impression, from reading). The subject is typically the method, problem or quantity named in the previous sentence, often as "this" plus a noun: 30 of 51 blocks use "This/These + noun" (60 instances), against 20 blocks (31 instances) that open a sentence with a bare "This" or "These" followed by a verb. The measured rate of bare openers is 0.0115 of sentences. The final stress position carries the limitation in gap sentences (1706.03762, cond-mat/0408187) and the number or comparison in result sentences (1506.02640, 1708.01492).

Constructed example: "Packed-bed reactors suffer hot spots near the inlet. This temperature peak sets the maximum feed concentration."

Openers. Measured connective openers are 8.6 % of sentences. "However" appears in 28 of 51 blocks, sentence-initial or mid-sentence (", however,"); mid-sentence placement is frequent in the cleaner texts (1706.03762 has three mid-sentence uses and no sentence-initial one). Enumerating openers ("First", "Second", "Finally") organise parallel points in 1505.04597, 1506.02640, 1609.02907, 1111.4246, cond-mat/0106096, math/0503066.

"We" and voice. "We" appears in 47 of 51 blocks; the four without it are 1105.1186, 0803.0476, 1303.3997 (which uses "us" once) and math/0312448. One essay uses "I" (1801.00862). The contribution is stated with "we" as subject in 32 blocks and with "this paper" or "this article" as subject in 15 (for example 1609.03499, 0810.3286, math/0503066, 1111.4246, 1405.0301). Passive voice (measured share 0.25) concentrates in descriptions of prior work and of procedures: 1506.08498 gives its calculation settings in the passive, 1405.0312 describes its labelling pipeline in the passive, and the history paragraphs of 0803.4060 report proposals by others in the passive or with the cited author as subject. The authors' own choices take "we".

Constructed example: "Heat-transfer coefficients were measured by the Wilson method in earlier work. We instead fit them jointly with the fouling resistance."

## 4. Claims and evidence

Numbers. Fifteen blocks state result numbers in the introduction (list in Section 1). Eight of these give the comparison baseline in the same sentence: 1607.00653 (gain over prior methods in percent), 1405.0312 (instances per image against two other datasets), 1506.02640 (frames per second, latency, error ratio against a named detector), 1603.02754 (winning solutions using the system against the next method), 1708.01492 (speed-up against a named aligner), cond-mat/0408187 (running time against the earlier algorithm), 1111.6097 (clustering time before and after), q-bio/0512013 (observed rates against the independent model). Hardware and units accompany speed claims in 1506.02640, 1706.03762 and 0810.3286. Uncertainty in prose is almost absent: one block gives an approximate scatter bound (astro-ph/0006289); the error bars of 0803.0547 and 1001.4538 sit in tables.

Constructed example: "On the 12-tray column the controller cut the reboiler duty by 8 % (from 2.40 MW to 2.21 MW) at equal top purity."

Strength. Claims about the authors' own result are stated without hedges. Priority claims ("first") occur in 8 of 51 (1509.06555, 1405.0301, 1610.06475, 2105.05537, 1411.4038, 1706.03762, 1708.01492, 1609.03499), qualified with "to our knowledge" in 3 (1411.4038, 1706.03762, 2105.05537). "State of the art" occurs in 8 of 9 machine learning blocks and 4 of 9 computer science blocks. Evaluative adjectives (surprising, remarkable, striking, excellent, dramatic, elegant) occur in 24 of 51; they cluster in 2105.05537, astro-ph/0604561, 1001.4538 and 0912.3599.

Hedges. Measured median is 3.95 per 1000 words; 16 of 51 blocks contain none of the listed hedge words (for example 1202.3665, 1505.04597, 1603.02754, 1706.03762, 1206.2332). Hedges sit in three places (impression with examples): interpretation of other work (0803.4060 on why a thermostat was unpopular), approximate statements in mathematics ("roughly", "essentially" in math/0503066, 0810.3286), and outlook (1801.00862, 1405.0301). The highest densities are 1104.4345, 0912.3599, math/0503066 and hep-ph/0603175.

Limitations. Four blocks state a limitation of the new work in the introduction (1506.02640, 1307.6212, 1104.4345, 0710.3820). In 1506.02640 the limitation paragraph directly follows three benefit paragraphs.

## 5. Terms and definitions

Abbreviations are introduced as full form followed by the short form in parentheses in about 30 of 51 blocks, then the short form is used alone. Definitions are given in three forms:

- A defining verb ("is called", "known as", "referred to as", "is said to be", "denotes", "dubbed"): 23 of 51 blocks, 45 instances. 1111.6097 builds its terms in a chain: one sentence defines the rule set, the next defines the rule set plus its parameters.
- An appositive right after the term: cond-mat/0408187, 1706.03762, 2304.03442, 1607.00653.
- Symbols defined in a "where" clause right after an equation: 10 blocks (1202.3665, 0912.3599, cond-mat/0408187, 0709.3906, 0810.3286, math/0410542, math/0503066, 0803.0476, 1111.6097, astro-ph/0604561); 1609.02907 defines every symbol of its loss term in the following two sentences.

New method names enter in the contribution sentence as "name, a [class] that [function]" in about 14 blocks (1607.00653, 1609.03499, 1603.02754, 1111.4246, 1409.7208, 1512.03012, 2304.03442, 1706.03762, 1003.1594, 1507.04544, 2105.05537, 1405.0301, 0810.3286, 1506.02640). The name is then the grammatical subject of the following sentences: 1506.02640 opens four consecutive paragraphs with it, and 1111.4246 and 1706.03762 repeat their names without synonyms.

Constructed example: "We present FlashSort, a bucket-based sorting routine that needs one pass over the input. FlashSort assigns each key to a bucket by linear interpolation."

## 6. Connectives and cohesion

Cohesion is carried mainly by repeating the noun and by "this" plus noun (counts in Section 3), less by explicit connectives (8.6 % of sentences measured). The explicit connectives that do the work are the contrast word for the gap ("however", "but", "unfortunately"; "Unfortunately" in 1202.3665, 0912.3599, 1105.1186, 1411.1607, 0803.0476), the enumerators for parallel points, and causal links ("as a result", "hence", "thus") inside the prior-work chain (1202.3665, 1505.04597). Citation density is high: 0.273 [CITE] per sentence, against 0.097 in results sections; most prior-work sentences end on a citation.

Constructed example of noun repetition as the link: "The catalyst deactivates by coking. Coking is fastest at the bed inlet, where the olefin concentration is highest."

## 7. Differences between groups

- Machine learning (9): shortest texts, contribution reached early, "state of the art" in 8 of 9, numbers on hardware or time (1506.02640, 1706.03762). Four of nine have no hedge word.
- Computer science and EESS (9): bulleted lists in 7 of 9 (0912.3599, 1411.1607, 1512.03012, 1607.00653, 1609.03499, 1610.06475, 2304.03442); bulleted contribution lists in 4 (1607.00653, 1609.03499, 1610.06475, 2304.03442; 1603.02754 in machine learning is the fifth).
- Mathematics and statistics (9): the problem is set up with symbols and prior theorems restated in the introduction (0810.3286, math/0410542, math/0503066), with a notation paragraph (0810.3286); register ranges from formal to humorous (1104.4345).
- Astrophysics (9): longer sentences, data-release papers that state membership in a paper series (0803.0547, 1001.4538, 1509.06555), and author-year narrative of prior results (astro-ph/0006289).
- Physics (other) and condensed matter (10): program and method papers with a historical opening (0803.4060, 0710.3820, 1405.0301, 1111.6097); the history is a chain of named methods with their defects.
- Quantitative biology (5): short; two tool papers by one author state the gap through tool-by-tool comparisons with read lengths and speed (1303.3997, 1708.01492).

## 8. Weak patterns

- Promotional adjectives without evidence attached: 2105.05537, 1603.02754, 2206.14220, astro-ph/0604561, 1411.1607 (counts in Sections 4 and 9).
- Grammar errors that interrupt reading: 1610.06475, 2105.05537, 1003.1594, 1603.02754, 0709.3906 (subject–verb agreement, fragments, typing errors).
- Very long list sentences: 1104.4345 strings more than 20 application areas with citations into one sentence; 2206.14220 averages about 40 words per sentence; 1001.4538 nests several parenthetical pointers to tables and sections in one sentence.
- Bulleted contributions that restate the preceding prose: 3 of the 5 bullet-contribution blocks (1607.00653, 2304.03442, 1603.02754).
- Inconsistent unit forms and number–unit spacing: 1708.01492 (three spellings of the same unit), 1303.3997 and 1409.7208 (no space between number and unit).
- Synonym cycling for one object (impression): 1411.4038 and 2105.05537 switch between several names for the convolutional network.
- Vague importance openers ("X is becoming very important in many areas"): 1603.02754, 1003.1594, 2105.05537.
- Conversational section headings: 0912.3599 ("A surprising message"), 1411.1607 (a promotional heading).

## 9. Comparison with the house rules

Strong texts were selected by judgment as those with clear moves, concrete gaps and stated numbers: 1706.03762, 1202.3665, 1506.02640, 1505.04597, cond-mat/0408187, 1111.4246, 0803.4060, 1609.02907, 1206.2332, q-bio/0512013.

Rules the strong texts follow:

- Symbols defined at first use (Section 5 of the rules): 1609.02907, 1111.4246, 1202.3665 and cond-mat/0408187 define each symbol in the same or the next sentence.
- Specific, quantitative wording (Section 3): 1506.02640, cond-mat/0408187, q-bio/0512013, 1111.4246.
- Term consistency, no synonym cycling (Section 4): 1506.02640, 1111.4246, 1706.03762.
- A citation for each modelling choice and prior method (Section 8): measured 0.273 citations per sentence; 1706.03762 and 1505.04597 cite each prior approach they name.
- Low em-dash use (Section 4): measured median 0 per 1000 words; dashes occur in 15 of 51 blocks, at most 4 per block (1202.3665, 2304.03442).
- Low density of the overused word set: 7 of the 10 strong texts contain none or one; the 44 hits across the bundle sit in 25 blocks, led by 2206.14220 (6).

Rules the texts break, including strong ones:

- "Write to explain, not to persuade" (Section 2). The gap move is argumentative by genre: a contrast connective turns the argument in 28 of 51 blocks, and importance words ("important", "essential", "critical", "significant") occur in 31 of 51 (71 instances). Strong texts limit the persuasion to one stated defect per prior method (0803.4060, cond-mat/0408187).
- Negative parallelisms (Section 4): 12 of 51 blocks, for example 1001.4538, cond-mat/0408187, 1409.1556, 1411.4038, 2304.03442, math/0503066.
- No second-person asides (Section 2): broken in 1411.1607, 1104.4345 and hep-ph/0603175; 1506.02640 uses "you" only inside its acronym.
- No origin or distribution statements in the document (Section 6): series membership (0803.0547, 1001.4538, 1509.06555), a prior abridged version (1405.0312), requests for feedback (0710.3820, hep-ph/0603175), and code or data availability in the introduction (at least 9 blocks, among them 1607.00653, 1506.02640, 1603.02754, 1507.04544, 1409.1556). Journal convention, which ranks above the house rules, permits most of these.
- Nominal, non-conversational headings (Sections 2 and 6): 0912.3599 and 1411.1607.
- Thin space between number and unit (Section 9): 1303.3997, 1409.7208, 1708.01492.
- Bullets only for parallel items, prose by default (Section 6): bullets are parallel in all 12 blocks that use them, but 3 of the 5 contribution lists duplicate prose.
- Hedging matched to evidence (Section 2): the strong texts hedge interpretations of others and state their own results without hedges, which agrees with the rule. Exceptions are priority claims without a qualifier (5 of the 8 "first" claims).
