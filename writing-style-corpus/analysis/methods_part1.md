# Methods sections of highly cited STEM papers, part 1

## Material and counting conventions

The bundle holds 34 methods sections: astrophysics (7), computer science and EESS other (6), condensed matter (3), machine learning (5), mathematics and statistics (4), physics other (3) and quantitative biology (6). Of these, 22 are cut at 1500 words and 21 lost their paragraph breaks in extraction. Paragraph counts therefore come from the 12 documents that kept them, and section length comes from the corpus metrics row. Counts marked "counted" come from reading the texts or from regex counts over the bundle. Statements marked "impression" are judgements from reading.

The corpus metrics row for methods (n = 67, median with interquartile range) gives: 1850 words [1010, 3020], 89 sentences [44, 147], mean sentence length 21.4 words [19.5, 23.8], sentence-length coefficient of variation 0.517 [0.456, 0.578], share of sentences over 40 words 0.063, passive share 0.293 [0.214, 0.436], "we/our/us" 15.8 per 1000 words [7.0, 22.2], hedges 3.03 per 1000 words, connective-initial sentences 0.073, bare "This/These + verb" openers 0.022, paragraph mean 81.8 words [60.6, 102], parentheses 10.4 per 1000 words and citations 0.135 per sentence. Methods have the highest passive share of any paper unit in the table (introduction 0.25, results 0.213), half the citation rate of introductions (0.273), and shorter paragraphs than introductions (94.2 words).

## 1. Structure

The 34 sections fall into six kinds (counted): algorithm or model derivation (14: 1509.06555, astro-ph/0505010, 1607.00653, 1706.02216, 0803.4060, cond-mat/0408187, 2010.11929, 0803.2392 and six others), empirical procedure and data (12: 1212.5226, 2212.04356, 1409.0575, 1010.3775, 1206.2332, 1207.7235 and six others), proof preliminaries (3: 0912.3599, 1105.1186, math/0307152), software description (3: 1009.1622, 1307.6212, 0710.3820), a survey of prior methods (0906.0612), and a mixed analysis-and-results section (0803.0547).

The usual sequence of moves, counted over all 34:

1. Orientation: a purpose, a design principle or a roadmap of the subsections. Present in 25 of 34 (for example 1212.5226, 1706.02216, 0803.2392, 1409.0575, 2010.11929). The other 9 begin with the first detail (astro-ph/0006053, 1409.4842, 1505.04597, 1010.3775, 1409.7208).
2. Formal setting: notation, the object being estimated, or the data inputs, usually with "Let", "We define" or "We assume". Present in 18 of 34, almost all in the derivation and proof groups.
3. Procedure: the method stated in order, as prose steps, a numbered list or pseudocode. Present in 33 of 34 (the exception is the survey 0906.0612, which describes other authors' procedures).
4. Justification of choices: a reason or a rejected alternative for at least one setting. Present in 18 of 34 (astro-ph/0505010, 1706.02216, 2212.04356, 1010.3775, 1305.3347, 1105.0828).
5. Scope or limitation: what the method does not cover, or an approximation it makes. Present in 10 of 34 (1206.2332, 1709.10010, 1509.06555, 0803.4060, 1409.7208).
6. Pointer onward: to an appendix, a later section or a code repository. Present in 19 of 34 by the regex count of "see/described in/refer to + Section/Appendix/Ref" plus explicit URLs.

Constructed example of moves 1 to 3: "The solver has two stages. The first stage computes the steady temperature field; the second integrates the transient from that field. Let T(x, t) be the wall temperature in kelvin and h the heat transfer coefficient in W/(m² K)."

Typical length is about 90 sentences in about 20 paragraphs (metrics row: 89 sentences, 81.8 words per paragraph). In the 12 documents with paragraph breaks, the median paragraph runs from 42 words (q-bio/0402017) to 142 words (1207.7235). Subsections are short and frequent: in the derivation group, a subsection often holds one idea, one equation and its symbol list (1705.07874, 2010.11929, 1003.1466).

## 2. Paragraphs

Openings (counted over the 12 documents with breaks, 125 paragraphs, impression for the run-on documents): most paragraphs open with a topic sentence naming the component or step treated, with the component as grammatical subject (1009.1622 opens five of five paragraphs this way; 2010.11929 six of seven). A second opening type states a purpose clause first, "To handle X, we ...", "In order to Y, ..." (1706.02216, 1206.2332, 2212.04356, 1409.0575). A third type opens with a run-in bold or italic label followed by prose ("Graph estimation.", "Inductive bias.", "Visual Stimulation."), counted in 6 of 34 (1206.2332, 2010.11929, q-bio/0512013, 1706.02216, 0912.3599, 1409.0575).

Constructed example of the label opening: "Boundary conditions. The inlet temperature is fixed at 300 K, and the outlet carries a zero-gradient condition."

Development follows the order of the procedure in the procedure group and the order of the derivation in the derivation group (impression, consistent in every document read). Paragraphs close in three ways: on a consequence of the step ("This gives ...", "As a result, ..."), on a parameter value, or on a pointer onward. Closing summaries that restate the paragraph are rare: none were found in 1009.1622, 2010.11929 or 1206.2332.

Hand-over between paragraphs uses three devices. Step order ("First ... Then ... Finally", counted in 22 of 34, densest in 0912.3599 with 7 and 1206.2332 with 5). Repetition of the last paragraph's object as the next subject, for example a paragraph ending on a weight function and the next beginning "The weight function ..." (impression, frequent in 1509.06555, 1305.3347, cond-mat/0408187). And contrast with the previous method ("Instead, ...", "In contrast to ..."), counted in 9 of 34 (1105.0828, 0803.4060, 1212.5226, 2212.04356).

## 3. Sentences

Information flow (impression, checked in every document read): the subject carries the known item, usually the component just named or the quantity just defined; the new item, a parameter value, an operation or a reason, sits at the end. Defined symbols move from the end of one sentence to the subject of the next. Constructed example: "The reactor is cooled by a jacket at temperature T_c. T_c is held constant along the length of the tube."

Final stress position holds the number or the reason. Sentences ending on a value are frequent in the procedure group (1010.3775, 2212.04356, 1206.2332). Sentences ending on a "because" or "to avoid" clause are frequent where choices are justified (2212.04356, 1105.0828, 1706.02216).

Length and rhythm: mean sentence length is 21.4 words, with a coefficient of variation of 0.517, so a 10-word sentence next to a 35-word one is normal. Only 6.3% of sentences exceed 40 words. Short sentences of fewer than 8 words appear in 32 of 34 documents (counted), and they are typically flat statements of a fact or a parameter: "No temporal smoothing was performed" in form. The highest counts are in 1206.2332 (14) and math/0307152 (10). Long sentences carry a definition list after an equation ("where A is ..., B is ..., and C is ...").

Openers (counted): sentences opening with "We" are frequent in 28 of 34. Explicit connective openers are 7.3% of sentences (metrics row). "Since/Because" as a sentence opener appears in 21 of 34. "Let" opens a definition in 9 of 34, mainly the proof and derivation groups (1105.1186 with 11, 1607.00653, 0803.2392, math/0307152). Imperative or invitational openers ("Consider", "Suppose", "Recall", "Write") appear only in 3 of 34, all mathematical (0912.3599, 1105.1186, math/0307152, with 0803.2392 using "Let us"). Questions appear in 1 of 34 (0803.0547).

"We": 32 of 34 use it at least once; 28 use it more than 4 times. The two with none are a collaboration search description (1207.7235) and a problem formulation written entirely in "Let" and passive (1105.1186). Software descriptions use it little (1009.1622, 0710.3820, 0906.0612: 1 to 2 each). "We" carries decisions and actions: "we use", "we set", "we adopt", "we train".

Active and passive: the split follows the content. The passive carries fixed apparatus and data handling, usually in the past tense: "Images were filtered", "Samples were generated". Counted "was/were + -ed" forms: 39 in 1010.3775, 11 in q-bio/0512013, 10 in 1206.2332, 8 each in 1409.4842 and 1305.3347. The active "we" in the present tense carries method choices and derivation: 1706.02216, 2212.04356, 1105.0828 and 1509.06555 have 6 to 10 present-tense "we + verb" forms and 0 to 3 past passives. Most documents mix the two within one paragraph, with "we" for the choice and passive for the execution. Constructed example: "We set the time step to 0.1 s. The equations were integrated with an implicit Euler scheme."

## 4. Claims and evidence

Numbers in methods are mainly settings, not results (counted): 15 of 34 state numeric settings with units or counts (2212.04356: sampling rate, window and stride; 1010.3775: participants, scan parameters; 1206.2332: SNP counts and window size; 1409.4842: learning-rate decay, crop counts). Units are given with the number in these 15. Uncertainties appear in 5 of 34: as ± intervals (0803.0547, 27 instances), as a stated percentage uncertainty (1212.5226), as an accuracy bound for a correction (astro-ph/0006053), as a measured annotation precision (1409.0575) and as a significance in standard deviations (1207.7235).

Comparison baselines are named when a choice replaces an earlier one: the previous data release (1212.5226), the earlier code version (astro-ph/0505010), the standard algorithm with its complexity (cond-mat/0408187, 1709.10010), or a competing tool (1305.3347). Constructed example: "Compared with the explicit scheme, the implicit scheme allows a time step 20 times larger at the same error."

Claim strength (counted with the metrics hedge list): hedges are 3.0 per 1000 words, the lowest of the paper units except captions and the same level as body text. Twelve of 34 documents contain no hedge word or one at most (1009.1622, 1212.5226, 2212.04356, 0803.4060, 1207.7235, 1010.3775). Procedure statements are unhedged. Hedges cluster in three places: expected behaviour not tested ("may improve performance", 0803.2392 with 10 hedges), effects of a choice the authors could not isolate (1409.4842, 6 hedges), and limits of a data source (1206.2332, 1409.7208). Impression: the strongest texts hedge the untested consequence and state the procedure flat.

## 5. Terms and definitions

Symbols are defined at first use by a "where" clause after the equation, counted in 18 of 34 (1509.06555, 0912.3599, 1709.10010, 1003.1466, 0803.4060). The derivation and proof groups do this almost without exception; the empirical groups have few equations and define acronyms instead. The "Here, X is ..." form follows an equation in 5 of 34 (0803.0547, 1509.06555, 1607.00653, q-bio/0402017).

Method names and new terms are introduced by an explicit naming verb ("we call", "termed", "known as", "denoted", "referred to as"), counted in 22 of 34. The term then recurs unchanged: once a step is named "the aggregation step" or "the estimation step", the same noun phrase is repeated (1706.02216, 0803.2392, cond-mat/0408187). Synonym cycling for a defined term was not found in the documents checked for it (1706.02216, 0803.2392, 1305.3347, 1206.2332).

A gloss in plain words follows a formal definition in 11 of 34, through "i.e.", "In other words" or "In words" (counted; 1105.1186 with 8, math/0307152 with 8, 1706.02216 with 7, 0912.3599 with 4). Constructed example: "The Biot number is Bi = hL/k. In words, Bi compares conduction resistance inside the wall with convection resistance at its surface."

Acronyms are expanded at first use in most documents (impression). Exceptions are listed in section 8.

## 6. Connectives and cohesion

Cohesion rests on noun repetition more than on connectives (impression, supported by the metrics row: 7.3% connective-initial sentences and 2.2% bare "This/These + verb" openers). "This/These + noun" as an opener ("This step", "These samples") is counted in 31 of 34, with up to 12 instances in 0803.2392 and 9 in 1206.2332.

Explicit connectives by function (counted, documents with at least one):

- Consequence ("thus", "therefore", "hence"): 25 of 34, densest in 0803.0547 and 0912.3599 (6 each).
- Contrast ("However"): 19 of 34, at most 4 per document (1105.0828).
- Exemplification ("for example", "e.g."): 22 of 34, densest in 1512.03012 (10) and 1409.0575 (5).
- Sequence ("First", "Then", "Finally"): 22 of 34.
- "Note that": 16 of 34, densest in 0912.3599 (5).

The density stays low: in a 1500-word section a typical count is 2 to 6 consequence links and 0 to 2 contrasts. Impression: the strongest procedure texts (1206.2332, 2212.04356, 1010.3775) rely on step order and repeated nouns almost alone.

## 7. Differences between groups

Counted differences, each from at least three documents:

- Mathematics and the theory-heavy computer science papers (0912.3599, 1105.1186, math/0307152, 0803.2392) use "Let", "Suppose" and future "we will/shall" for what the proof will do (0912.3599 has 11 "will/shall", math/0307152 has 7), and gloss formal statements in words.
- Quantitative biology and the experimental parts of physics (1010.3775, q-bio/0512013, 1206.2332, 1207.7235) use the most past-tense passive and the most numeric settings with units, and give data sources with dates or URLs (1206.2332, q-bio/0512013).
- Machine learning (1706.02216, 2010.11929, 1705.07874, 2212.04356) uses present-tense "we", short subsections per component, and states design choices with a reason ("since we have not observed gains", in form).
- Astrophysics collaboration and software papers (1212.5226, 1009.1622, 1307.6212, astro-ph/0006053) are inventory-like: one paragraph per data set or module, each naming its source with a citation. 1212.5226 has 39 citation markers in 1500 words, the highest in the bundle.
- Software descriptions (1009.1622, 0710.3820, 1307.6212) avoid "we" for the code and make the code or the module the subject.

## 8. Weak patterns

Habits in the bundle that hurt readability, so a style guide should not copy them:

- Stock attention phrases ("It is worth pointing out", "It is interesting to note", "it is important to note"), counted in 4 of 34 (astro-ph/0505010, 1706.02216, 1003.1466, 0906.0612). In each case the following clause stands without the phrase.
- Evaluative adjectives in a methods context ("remarkable", "excellent", "fascinating", "extremely", "uniquely"), counted in 13 of 34 with at least one; clustered in 1512.03012, 1709.10010 and 0803.0547. Some instances are technical ("excellent mass resolution", 1207.7235); most are not.
- Future-tense plans inside a methods section: 1512.03012 has 13 "will/shall", mostly for annotations not yet made, so the reader cannot tell what was done.
- Unexpanded acronyms and tool names: 1409.7208 (several tool names and an algorithm label without expansion), 1207.7235 (generator names), 1212.5226 (survey names).
- Undefined "simple", "straightforward", "easily", "clearly": counted in 28 of 34, up to 6 in 1706.02216. The word asserts ease without showing it.
- Typing errors left in the text: 1003.1466, 1305.3347, 1409.0575 and 1607.00653 each have at least one misspelled word (counted by reading).
- Run-on sentences of 60 words or more that stack a definition, a condition and a reason (impression, several in astro-ph/0505010 and 1607.00653).
- Popular-science openings in a technical section: 1003.1466 opens with a description of insect behaviour before the algorithm.

## 9. Comparison with the house rules

Rules the strong texts follow:

- Define every symbol at or before first use (house rules section 5). Followed in the 18 documents with "where" clauses, without exception in 0803.4060, 1509.06555 and 1709.10010. Units accompany numeric settings in all 15 documents that state them.
- Repeat the correct term; no synonym cycling (section 4). Followed in every document checked (1706.02216, 0803.2392, 1305.3347, 1206.2332).
- Brevity and plain words; no throat-clearing (section 3). The procedure group (2212.04356, 1206.2332, 1010.3775, 1505.04597) opens with the first fact and has no summary closings.
- Prose as the default form, bullets for parallel items (section 6). Bullet lists appear in 11 of 34 and hold genuinely parallel items: data structures (cond-mat/0408187), algorithm steps (0803.2392), class fields (0710.3820).
- Every computed quantity defined by what is computed, from what data, in what steps (section 7). Followed closely by 1105.0828 (the stopping criterion and both error measures), q-bio/0402017 (the cross-validated smoothing parameter) and 1206.2332 (the jackknife standard error).
- Every modelling choice cited (section 8). The derivation and empirical groups cite each adopted method; citation density is 0.135 per sentence (metrics row).

Rules the texts break:

- Words from the overused set (section 4): "key", "crucial", "important", "valuable" appear in 25 of 34; densest in 1512.03012 (8) and 1105.1186 (5).
- "It is worth noting" and similar filler (section 4): 4 of 34, listed in section 8.
- Promotional wording (section 4): 1512.03012, 1709.10010, 1003.1466.
- "e.g." and "i.e." (house rules section 12, at 100% only): common, 11 of 34 use "i.e." and 22 use "for example" or "e.g." This rule applies only when the style dial is set, so it is not a defect at 0%.
- Abbreviation defined next to first use (section 5): broken in 1409.7208, 1207.7235 and 1212.5226.
- Numbered equations referred to in the text (section 9): followed in the derivation group (1705.07874, 1607.00653, cond-mat/0408187 refer to equations by number); the extracted text does not show whether the empirical group numbers its few equations.

Points where the corpus is more specific than the house rules: the split of active "we" for choices and past passive for executed steps (section 3 above) is a consistent pattern that the house rules leave open, and the habit of following a formal definition with a plain-words gloss (11 of 34) matches the rule to explain a technical word at first use.

## Checked and not checked

Counted: move presence, opener types, "we" forms, passive past forms, connective and hedge counts, definition clauses and naming verbs, all over the 34 documents in this bundle, with regex counts read against the text. Not checked: section length and paragraph structure for the 21 documents without paragraph breaks, and any material past the 1500-word cut in 22 documents. The share of documents with a pattern is therefore a lower bound for patterns that occur late in a section (limitations, pointers onward).
