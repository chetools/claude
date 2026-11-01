# Abstracts of highly cited STEM papers: style analysis

Corpus: 140 abstracts, 20 in each of seven arXiv groups (astrophysics; computer science and EESS (other), "CS" below; condensed matter, "CM"; machine learning, "ML"; mathematics and statistics, "math"; physics (other); quantitative biology, "q-bio"). All 140 were read in full. Counts marked "counted" come from a pattern search over the bundle and were checked against the text; counts marked "hand count" come from reading; statements marked "impression" are not counted. Measured features are quoted from the abstract row of `metrics_summary.csv` (n = 136, because units with fewer than three sentences are excluded there); values are medians with the interquartile range (IQR, the 25th to 75th percentile) in brackets.

## 1. Structure

Two kinds of abstract are present, and they follow different move sequences (hand count). Research abstracts report a method, measurement or theorem (102 of 140). Resource abstracts describe a software package, dataset, mission, review or manual without a tested claim (38 of 140, for example 1307.6212, 1603.04467, 0906.2569, 1201.0490, 0710.3820, 2012.10295).

Research abstracts. The usual sequence is context, gap, contribution, method detail, result, and an optional implication or availability line.

- A gap move (a stated limitation of existing work or an open question) precedes the contribution in 52 of 102 (hand count; for example 1105.1186, 1502.03167, 1705.07874, 1111.4246, 1305.3347). By group: q-bio 13, math 12, CS 8, ML 8, CM 6, physics (other) 4, astrophysics 1.
- In 7 of these the gap is a direct question, all in CS and math (counted: 0805.4471, 0912.3599, math/0409186, math/0410542, math/0502327, math/0503066, math/0610840).
- The other research abstracts open on the contribution itself. "We" is the first word in 30 of 140 (counted; 1212.5226, 0803.1670, 1412.6980, 1506.02640, 1002.4734), and a first sentence that contains "we" occurs in 34.
- An implication sentence after the results closes 26 of 102 (hand count; 1304.6875, 0805.2850, 0806.1256, 1305.4022, q-bio/0512013). A code or data availability statement appears in 28 of 140, almost always as the last sentence (counted; 1505.04597, 1608.06993, 1305.3347, 2103.00020).

Constructed example (gap, contribution, result, availability): Existing correlations for falling-film heat transfer fail above a Reynolds number of 2000. We derive a two-zone model that holds from laminar to turbulent flow. Against 312 measured points, the model reduces the mean absolute error from 24 % to 7 %. The code is available online.

Resource abstracts. The sequence is definition of the object, list of its capabilities, history or release, and availability (1009.1622, 1307.6212, 1410.3012, 2106.11799). Among abstracts about a tool or resource, 12 open with a copular definition ("X is a ...") (hand count; 1603.04467, 0906.2569, 1709.10010, 1201.0490, 1111.6097, 0710.3820, 1410.3012, astro-ph/0409513, 1609.04153, 2012.10295, 1303.3997, 1409.7208).

Length. Measured: 160 words [126, 202] and 6 sentences [5, 8.75]. A sentence count over the bundle gives a range of 1 to 20; 13 of 140 have three sentences or fewer (counted; 0711.0156, cond-mat/0410550, physics/0508025, 2003.06557). One paragraph is the norm: 110 of 140 are a single block (counted). The 30 multi-paragraph abstracts cluster in math (11 of 20; 0810.3286, 1111.4246, math/0409186).

## 2. Paragraphs

Most abstracts are one paragraph, so the paragraph structure is the move structure above. Inside it, development is linear: each sentence adds one step, and none returns to an earlier point (impression, consistent with the low measured connective-opening rate, 0 [0, 0.138]).

Where there are two or more paragraphs, the split falls at the boundary between problem and answer (hand count: 9 of 30, 0805.4471, 1111.4246, 1507.04544, math/0409186, math/0502327, math/0503066). The first paragraph poses the problem and its difficulty. The second opens with the contribution verb ("We introduce", "We prove", "This paper shows"). A third paragraph, where present, gives scope or connections to other work (0805.4471, math/0409186, math/0502327).

Labelled sub-paragraphs (Motivation, Results, Availability, Background, Conclusion) appear in 6 of 140, five of them in q-bio (counted; 1203.6372, 1303.3997, 1708.01492, 1501.01455, q-bio/0410037). In these, the label carries the handover and no connective is used.

Constructed example (two-paragraph handover): A sorting network must compare every pair whose order is unknown, and the best known depth grows with the square of the logarithm of the input size. Can depth be reduced when most of the input is already sorted? / We prove that, for inputs with at most k inversions, a network of depth proportional to log k suffices.

## 3. Sentences

Length and rhythm. Measured: mean 24.6 words per sentence [20.3, 28.8]; standard deviation 7.96 [5.97, 11.3]; coefficient of variation 0.35 [0.26, 0.435], the lowest of all paper unit types in the summary (body 0.625, introduction 0.466). The share of sentences longer than 40 words is 0 [0, 0.2]. Abstracts therefore run at an even, fairly long sentence length, with less alternation than other sections. The strongest abstracts break the rhythm with one short evaluative sentence of five to eight words placed after a long technical sentence (hand count: 8 of 140; 1505.04597, 1506.02640, 1512.03385, 1403.6652, 1002.4734, math/0608017, 1411.1607, 0912.3599). The short sentence states a property (speed, scalability, a trade-off) and the next sentence quantifies it.

Constructed example: The reactor model couples 40 species through 112 reactions and integrates the stiff system with an implicit scheme. The solver is fast. A full transient of 10 s takes 0.3 s on one core.

"We" and voice. "We", "our" or "us" appears in 115 of 140 (counted); measured rate 17.1 per 1000 words [7.8, 26.1]. "I" appears in 2 (physics/0508025, 1509.01845). The verbs after "we" are, by count: present 35, show 26, demonstrate 19, propose 17, find 14, introduce 12, prove 10, report 9, discuss 9, provide 8, describe 8. "Present", "propose" and "introduce" carry the contribution; "show", "demonstrate", "find" and "prove" carry results.

Measured passive share is 0.222 [0.125, 0.40]. The passive sits in three places (hand count):

- method or architecture description, where the device is the topic (1409.4842, 2105.05537, 1506.01497, 0802.2389);
- large-collaboration results, where the whole abstract is passive (1207.7235, hep-ph/0201195);
- the impersonal results frame "it is shown" or "it is found", in 10 of 140 (counted; astro-ph/0009005, 1105.1186, 0803.4060, 0803.0476).

Information flow (impression, supported by the counts named). The subject position holds either "we" or the named method, model or system; the end of the sentence holds the new item: the number, the dataset, the condition, or the comparison baseline. In 17 of 18 abstracts that introduce a name with an appositive ("We present X, a ..."), the name or a shell noun ("the method", "the model") is the subject of a later sentence (hand count; 1506.02640, 1412.6980, 1111.4246, 1305.3347, q-bio/0410037; exception 0711.0156, where the name is introduced in the last sentence). The known item then sits at the start and the measured value lands in the final stress position.

Constructed example: We introduce a packed-bed model with radial dispersion. The model predicts hot-spot temperatures within 4 K of the measurements.

Openers. Sentence openers are mostly the subject: "We" (30 first sentences), a method or object name, or a field noun phrase (impression). Frame phrases are "In this paper/work/letter/article/review/report/manuscript" in 26 of 140 (counted; 1505.04597, 1506.01497, 1005.4917, 1206.2332), "Here we" or "Here I" in 17 (counted; CM 6 of 20: 0805.2850, cond-mat/0509330, cond-mat/0408187; q-bio 4), and "This paper" followed by a verb in 16, of which 9 are in math (0709.3906, 0810.3286, math/0410542).

## 4. Claims and evidence

Numbers. A percentage appears in 20 of 140 (counted). A multiplicative factor ("3 times larger", "a factor of 10") appears in 8 (counted; 0802.2389, 1004.0546, 1502.03167, 1409.7208, 1708.01492). An explicit comparison phrase (compared with, relative to, improvement over, than existing) appears in 33 (counted; 1706.03762, 1810.04805, 1305.3347, 0709.1916). The strongest quantitative abstracts give each number with three attachments: the value, the baseline it beats, and the condition (dataset, resource or regime). Examples are 1706.03762 (score, margin over the previous best, training time and hardware), 1810.04805 (each score with its absolute improvement), 1502.03167 (accuracy at a stated reduction in training steps), and 1409.7208 (assembly time with and without a GPU).

Uncertainty. A ± value or a confidence level appears in 5 of 140 (counted; 0803.0547, 1001.4538, 1212.5226, 1304.6875, 1710.05832), all astrophysics or gravitational-wave work. Significance in standard deviations is given in 1207.7235 and 1509.06555. Outside these fields, results are stated as point values without uncertainty (impression; 1403.6652, 1512.03385, 1305.4022).

Constructed example: The measured overall heat-transfer coefficient is 410 ± 12 W/(m² K) (one standard deviation, n = 15), 18 % above the Dittus–Boelter prediction.

Units. Physical units accompany the number in CM and astrophysics results (0802.2389, 0905.1712, 1004.0546, 0803.1670, 1710.05832); ML gives benchmark metrics with the benchmark name in place of a unit (1411.4038, 1706.03762).

Strength and hedging. Measured hedge rate is 0 per 1000 words [0, 4.28]; hedge words appear at all in 34 of 140 (counted). The pattern is consistent (hand count over those 34): results and theorems are stated without hedges ("we prove", "achieves", "outperforms"), and hedges appear in the implication or mechanism sentence that follows ("could", "should allow", "suggests"; 0802.2389, 0806.1256, 0905.1712, q-bio/0512013, astro-ph/0009005). Five abstracts state belief or hope directly ("we argue", "we hope", "we anticipate", "we believe"; counted; 0709.1916, 1608.04644, q-bio/0402017, 1104.4345, 1607.00653). Strong evaluative adjectives (excellent, unprecedented, remarkable, perfectly, extremely) appear in 19 (counted; 1502.00956, 1506.02640, 0803.4060, cond-mat/0702595). "State of the art" appears in 25, 15 of them in ML (counted).

Conditions on claims. Math and theory abstracts attach the condition inside the claim: "if the number of samples obeys ..., then with high probability ..." (0805.4471, math/0409186, math/0502327, math/0503066, 1002.4734). The condition is a working part of the result.

Constructed example: If the feed contains less than 2 % water, the proposed sequence recovers the solvent at 99.5 % purity with one column.

## 5. Terms and definitions

Method names. A new name is introduced in an appositive after the contribution verb, then reused unchanged (18 of 140, hand count; 1506.02640, 1412.6980, 1111.4246, 1305.3347, 1705.07874, q-bio/0410037). No abstract cycles synonyms for its own method name (impression); the fall-back substitute is a shell noun ("the method", "the model", "the algorithm").

Named phenomena. Five abstracts name a phenomenon or quantity with an explicit naming verb ("we refer to this as", "which we call", "is called"; hand count; 1502.03167, physics/0602124, math/0502327, 1305.3347, 1411.4038). The name follows the description and is then used as a noun.

Constructed example: Bubbles coalesce near the wall faster than in the bulk; we call this wall-enhanced coalescence and measure its rate as a function of wall shear.

Abbreviations. The parenthetical full form at first use is the norm in abstracts that use abbreviations (hand count; 1212.5226, 1105.1186, 1111.4246, 1507.04544, 1609.04153, 1305.4022). At least 8 abstracts use an abbreviation without its full form (0706.0456, 1405.0301, 0709.3906, 1203.6372, 1409.7208, 1411.4038, 1308.6483, 1405.0312). One abstract defines the same abbreviation twice (1501.01455).

Symbols. Math abstracts define a symbol in a "where" clause right after the expression (0803.2392, math/0502327, math/0503066, 0810.3286).

## 6. Connectives and cohesion

Explicit connectives are sparse. Measured: share of sentences opening with a connective 0 [0, 0.138]; semicolons 0 per 1000 words [0, 0]; em dashes 0 [0, 0]. Counted occurrences anywhere in the abstract: "However" 17 of 140, "thus/hence/therefore" 12, "Moreover/Furthermore/In addition/Additionally" 10, "Unlike/Instead/in contrast/whereas" 10, "Specifically/In particular/More precisely" 8, "Finally" 7, "For example/For instance" 4, "In short" 2 (math/0409186, math/0502327).

"However" has one main job: it marks the gap after a context sentence (11 of 17, hand count; 1105.1186, 1706.02216, 2105.05537, 2308.04079, 1111.4246). "Instead" and "Unlike" mark the contrast between prior work and the new method (1506.02640, 1810.04805, 1706.02216).

Cohesion is carried mainly by repetition (hand count, impression on density):

- repetition of the method name or of a shell noun in subject position (section 3);
- "this/these" plus a noun at sentence start, in 37 of 140 (counted, approximate pattern match; 0912.3599, 1010.3775, 0810.3286, 1405.0312);
- a colon that introduces a list or an explanation, in 25 of 140 (counted; 1102.1523, 1610.05820, 1502.03167).

Bare "This" plus a verb, with no noun after it, opens a sentence in 13 of 140 (counted; 0912.3599, 1509.06555, 0805.2850, 1502.03167, q-bio/0512013).

Enumerations with (i), (ii) or first, second, third carry multi-part methods or results in 8 (counted; 1509.06555, 2308.04079, cond-mat/0308217, 1705.07874, q-bio/0502035).

Constructed example: The heat exchanger has two weaknesses: fouling on the shell side and maldistribution at the inlet. The fouling raises the pressure drop by 30 % within six months.

## 7. Differences between groups

- Astrophysics. Collaboration data papers list many fitted parameters with ± values and confidence levels in sequence (0803.0547, 1001.4538, 1212.5226). "For the first time" or "the first" occurs in 7 of 20 (counted; 1001.4538, 1502.01583, astro-ph/0505010). 11 of 20 are resource abstracts (software, mission, pipeline, review; hand count).
- CS. A gap marked by "However" in 6 of 20 (counted). Systems are named and evaluated on named benchmarks, and code release closes the abstract (1502.00956, 1610.06475, 2105.05537).
- CM. "Here we report" or "Here we demonstrate" opens the contribution in 6 of 20 (counted; cond-mat/0509330, cond-mat/0509355, 0805.2850). Results carry physical units and factors of improvement (0802.2389, 1004.0546, 0905.1712). Short abstracts (one to three sentences) are more common here (0711.0156, cond-mat/0410550, cond-mat/0503533, 0906.2569, 1709.10010).
- ML. "State of the art" in 15 of 20 (counted). Most research abstracts name a benchmark and give a score (1706.03762, 1810.04805, 1411.4038, 1512.03385). Competition placings are used as evidence (1409.1556, 1505.04597, 1506.01497, 1512.03385).
- Math. Question-led problem statements in 5 of 20 and "This paper" plus a verb in 9 of 20 (counted). Multi-paragraph form in 11 of 20 (counted). Claims are conditional theorems.
- Physics (other). Mixed: program manuals with keyword lines (0710.3820, 1410.3012, hep-ph/0603175), fully passive collaboration reports (1207.7235, hep-ph/0201195) and network-science abstracts close to CM style (physics/0602124, physics/0506133).
- q-bio. Labelled sections in 5 of 20 (counted). A gap move in 13 of 20 (hand count), the highest of all groups. Tool abstracts give speed or accuracy ratios against named competitors (1305.3347, 1708.01492, 1409.7208).

## 8. Weak patterns

- Promotional wording and importance inflation, in 6 abstracts (hand count; 1207.0203, cond-mat/0702595, 1506.08498, astro-ph/0604561, 2206.14220, 1502.00956). These use metaphors of stars and revolutions, claims that importance cannot be overstated, and "unprecedented" without a stated baseline. Text of this kind takes the place of a number.
- Stated intent in place of a result. In 4 abstracts, "we will" or "we intend" stands where a result should be (counted; 1003.1466, 1003.1594, 1004.4170, 0906.0612). Two of them also claim superiority with no number (1003.1466, 1004.4170); 2105.05537 claims it with no margin.
- Feature inventories. A long list of capabilities, sometimes 8 to 10 items joined by semicolons, makes up the whole abstract (1009.1622, 1307.6212, 1707.00027, 1111.6097). Nothing in these lists is ranked or quantified.
- Bare "This" plus a verb. In 13 abstracts the referent is a whole preceding clause (section 6). The stronger abstracts add the noun ("This reduction", "These limits").
- Trailing participle clauses that add an evaluation, such as "highlighting", "confirming", "supporting" or "revealing" (hand count, at least 6; 1305.4022, 1212.5226, 1304.6875, 0806.1256, cond-mat/0408187, 1501.01455).
- Undefined abbreviations, in at least 8 abstracts (section 5).
- Plain-text number and unit notation, with ASCII exponents and "*" for multiplication (0802.2389, 0905.1712).
- One-sentence abstracts that pack contribution, method and result together. cond-mat/0410550 packs three claims into one clause chain; 0708.1752 gives a claim with no method.
- Extraction artefacts. 1607.00653 holds two versions of the same abstract. Several abstracts have holes where a name was removed. These come from the corpus and say nothing about style.

## 9. Comparison with the house rules (`writing-style.md`)

Rules the strong abstracts follow:

- Quantitative, specific wording (Section 3). The strongest abstracts give value, baseline and condition together (1706.03762, 1810.04805, 1502.03167, 1305.3347, 1710.05832).
- Uncertainty and conditions stated, and verified facts kept apart from inference (Section 2). Results are unhedged, implications are hedged, and uncertainty is given with a confidence level (0803.0547, 1710.05832, astro-ph/0009005, q-bio/0512013).
- Abbreviations defined at first use (Section 5): 1212.5226, 1111.4246, 1507.04544, 1609.04153.
- Symbols defined where they first appear (Section 5): 0803.2392, math/0502327, math/0503066.
- Term consistency, with no synonym cycling for the method name (Section 4): 17 of 18 named-method abstracts.
- Low em-dash, semicolon and connective density (Section 4): measured medians of 0.
- No second person: measured "you" rate 0 [0, 0].
- No mechanical boldface and no emoji (Section 4): none in the bundle.
- Prose as the default form (Section 6). Bulleted lists occur once (1411.1607).

Rules the corpus breaks:

- Register (Section 2). "We" is the default voice (115 of 140, rate 17.1 per 1000 words), against the impersonal register in Section 2. The best abstracts use "we" for actions and claims (1706.03762, 1111.4246, 0805.4471). A guide based on this corpus would need to allow first-person plural in abstracts, or the house rule would need to state that it applies to abstracts too.
- Hype and promotional wording (Sections 2 and 4): 1207.0203, cond-mat/0702595, 1506.08498, astro-ph/0604561, 1502.00956, 1506.02640.
- The overused word set (Section 4): "key", "crucial", "essential" or "critical" in 25 abstracts and "robust" in 10 (counted). "Serves as", "fosters" and an unsourced future outlook appear together in 2206.14220.
- Trailing participle clauses (Section 4): 1305.4022, 1212.5226, 1304.6875, 0806.1256.
- Negative parallelisms of the form "not X but Y", "rather than" or "not only ... but" (Section 4): cond-mat/0008064, 0709.1916, 1308.6483, 1610.06475.
- Statements of origin or purpose (Section 6): 1308.6483 opens by stating which paper it supplements; 1506.08498 and 1603.04467 name who built the code.
- Typography of numbers and units (Section 9): ASCII exponents and hyphen-minus in 0802.2389, 0905.1712 and 0803.0547. The source format of arXiv abstracts may cause some of this, so it is not counted as an authorial choice.
- Undefined abbreviations (Section 5), in at least 8 abstracts.
- Uncertainty or the number of observations n with every number (Section 10 applies this to captions; Section 7 asks for full definitions). Outside astrophysics and gravitational-wave physics, numbers are rarely given with uncertainty (5 of 140 give ± values). The corpus does not support this as a norm for abstracts. The house rule is stricter than common practice here.
