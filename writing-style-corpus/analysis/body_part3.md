# Body sections, bundle part 3: style analysis

## Scope and reading basis

The bundle holds 44 blocks. Three are not body prose and were set aside: 1105.1186 (acknowledgments only), 1303.3997 (availability, contact and funding lines) and 1409.7208 (title and abstract only). All counts below are out of the remaining 41 blocks unless stated otherwise. Thirty-four blocks are cut at about 1500 words, so the counts describe the opening part of the body, not whole papers. Ten blocks begin with title, author and abstract text extracted with the body (for example 0802.2389, 1004.0546, 0709.1916, 2507.01682); these were read as letter-style full texts. In 33 of the 41 blocks the paragraph breaks were lost in extraction (one line per block), so paragraph-level statements rest on the 8 blocks with visible breaks (1202.3665, 1609.03499, 1706.02216, 1505.04597, 1512.03385, 1003.1466, math/0312448, math/0502327) and on subsection boundaries elsewhere.

Counts come from two sources. Mechanical counts (sentence openers, "we", imperatives, question marks) come from a regular-expression pass over the bundle and are labelled as such; they include a few false positives. All other counts come from reading and are judgments with document IDs. Statements marked "impression" were not counted.

The corpus-wide measured features for body units (metrics_summary.csv, paper/body, n = 35, median with interquartile range) are the numerical reference: mean sentence length 22.8 words [21.4, 24.8], standard deviation of sentence length 13.8 words, coefficient of variation 0.63, share of sentences over 40 words 0.085, passive share 0.26, "we/our/us" 7.7 per 1000 words, hedge words 3.2 per 1000 words, connective-opened sentences 0.083, bare "This/These + verb" openers 0.020, mean paragraph 129 words, semicolons 2.0 and parentheses 22.8 per 1000 words. Body sentences are about as long as introduction sentences (22.4) but vary more (coefficient of variation 0.63 against 0.47) and carry about three times as many parentheses (22.8 against 8.2 per 1000 words).

## 1. Structure

The blocks fall into five kinds of body text, with overlap.

Letter-style full texts without section headings (7: 0802.2389, 0805.2850, 1004.0546, cond-mat/0503533, 2507.01682, physics/0506133, 0709.1916). All 7 follow the same sequence: broad context in one or two sentences, a named obstacle, a contribution sentence opened by "In this Letter we" or "Here we", the preparation or method, the first observation, and its interpretation. In 4 of the 7 the contribution sentence already carries the headline number with a comparison factor (0802.2389, 0805.2850, 1004.0546, 0709.1916). The method is reached within the first 400–600 words in all 7.

Model and method sections (18, for example 1609.03499, 1512.03385, 1603.04467, 1609.02907, cond-mat/0308217, 0802.1189, q-bio/0512013). The usual move sequence is: purpose of the component, its definition (often an equation), a symbol glossary, the reason for the design choice, its cost or limit, and a pointer to the evidence. Thirteen of the 18 follow all of these moves in at least one subsection (1609.03499, 1512.03385, 1505.04597, 1609.02907, 1810.04805, 1411.4038, 1603.04467, cond-mat/0308217, 0802.1189, q-bio/0512013, 0709.3906, 1406.5823, 1003.1466).

Related-work sections (6: 1706.02216, 2304.03442, 1411.4038, 1512.03385, 1609.02907, 1810.04805). Each subsection groups prior work by approach, states what the group does, states its limit, and in 5 of the 6 closes with a contrast to the authors' own method ("Unlike these approaches, we ..."; 1706.02216, 1411.4038, 1512.03385, 1609.02907, 2304.03442).

Proofs and derivations (6: 0805.4471, 1104.4345, math/0502327, math/0610840, 0709.3906, 2507.01682). The sequence is: claim, set-up by imperative ("Consider", "Let", "Fix"), a chain of steps joined by "Then", "Hence", "Therefore", the closing "the claim follows", and then an interpretation in words ("In other words", "To appreciate the content of the theorem"). Five of the 6 add the interpretation step (all except 1104.4345, which interprets mostly through remarks before the next result).

Review and survey narrative (10, for example 0909.0948, 1308.6483, astro-ph/0009005, cond-mat/0702595, 0906.0612, 1801.00862). These run as a sequence of topics, each opened by a topic sentence and developed through a history of results by named authors.

Length: in the uncut blocks, subsections are short. In 1609.03499 and 1512.03385 a subsection is 2–6 paragraphs of 2–6 sentences. Impression: subsections in method sections are shorter than in reviews.

## 2. Paragraphs

Opening. In the 8 blocks with visible paragraphs, 7 open most paragraphs with a sentence whose subject is the component or quantity the paragraph is about, stated as a fact (1609.03499, 1512.03385, 1505.04597, 1202.3665, 1003.1466, math/0502327, 1706.02216). The rest of the blocks show the same at subsection starts: the first sentence after a subsection title names the object of the subsection as its grammatical subject in 24 of 41 blocks (for example 1603.04467, 1707.00027, physics/0506133, 1409.0575, 0906.0612).

Constructed example: "The baffle spacing sets the cross-flow velocity on the shell side. A smaller spacing raises the velocity and the heat-transfer coefficient, but it also raises the pressure drop."

Development. Paragraphs develop by one of three routes: mechanism (cause then effect, 1609.03499, 0802.1189, 0709.1916), procedure (step then step, 1603.04467, 1505.04597, 1004.0546) or history (earlier result, challenge, confirmation, 0909.0948, 1308.6483, astro-ph/0009005, cond-mat/0702595).

Closing. Closing sentences most often state a consequence for the design or a limit ("for which we have not observed advantages", 1512.03385; "This keeps the computational requirements at a reasonable level", 1609.03499) or point to where the evidence sits ("see Section", "in Appendix"). Pointer closings occur in 15 of 41 blocks (for example 1603.04467, 1707.00027, 1609.02907, 1405.0301, 1406.5823).

Hand-over. The next paragraph usually starts from a noun placed at the end of the previous one. In 1609.03499 the receptive-field limit at the end of one paragraph becomes "A dilated convolution" at the start of the next; in cond-mat/0308217 "the recalculation step" is named at the end of one unit and opens the next. This end-to-start noun hand-over was found in 16 of 41 blocks (impression of a minimum; for example 1609.03499, cond-mat/0308217, 0709.1916, q-bio/0512013, 1202.3665).

## 3. Sentences

Information flow. The known item sits in the subject; the new item sits at the end, often after a colon or in an appositive, and becomes the subject of the next sentence. This pattern was marked in 20 of 41 blocks (for example cond-mat/0308217, 1202.3665, 1411.4038, physics/0506133, 0709.1916).

Constructed example: "Heat leaves the wall by a second route as well: radiation to the cold vessel walls. Radiation dominates above about 600 °C."

Length and rhythm. Body sentences in the corpus have a mean of 22.8 words but a standard deviation of 13.8 words, so short and long sentences alternate. A specific device in this bundle is a short evaluative sentence of 4–8 words that announces the next explanation, placed after a long sentence: "The physical basis is simple." type (1308.6483), "The solution is obvious." type (cond-mat/0308217), "The proof is not difficult." type (2507.01682), and similar in 1411.1607, 1801.00862, 0709.1916, cond-mat/0702595, 0805.2850, math/0312448. Count: 9 of 41.

Constructed example: "The fouling resistance grows with time, wall temperature and fluid velocity, and each of these changes along the exchanger. The net effect is simple. The outlet temperature drifts upward until the tubes are cleaned."

Questions. Direct questions frame the next step in 8 of 41 blocks (1308.6483, 0805.2850, cond-mat/0702595, 2507.01682, 1801.00862, 0709.1916, q-bio/0512013, math/0502327); 0906.0612 uses the indirect form "The question is whether". Each question is answered within the next three sentences in all 8.

Openers. Mechanical count of sentence openers per block: "Thus/Hence/Therefore/So/Consequently" open at least one sentence in 27 of 41 blocks; "However" in 17; "First," in 10 (as part of an enumeration). Imperative or "Let us" set-ups ("Consider", "Let", "Suppose", "Fix", "Imagine") occur in 14 blocks, with the highest densities in the proof blocks (0805.4471: 8, math/0502327: 10, math/0610840: 11, 1104.4345: 12) and single thought experiments in 1603.04467, 1512.03385, 1609.02907, 1801.00862, 0709.1916, 1411.4038.

"We". "We/our/us" occurs in 35 of 41 blocks. The six without it are astro-ph/0009005 (passive throughout: "is adopted"), 1709.10010, cond-mat/0702595, 1409.0575, 0709.3906 (one use; otherwise imperatives) and math/0312448 (first person singular). First person singular "I" occurs in 3 (2507.01682, 1801.00862, math/0312448). "We" is the agent of decisions and inferences: "we choose", "we avoid", "we attribute", "we deduce", "we recommend".

Voice. A division of labour between voices appears in 8 blocks: passive for routine operations and apparatus ("the devices were annealed", "the image is resized"), active "we" for choices and conclusions (0802.2389, 1004.0546, 0805.2850, 0909.0948, 1512.03385, cond-mat/0503533, 2106.11799, 1505.04597). The corpus passive share for body units (0.26) is near that of introductions (0.25) and lower than methods (0.29).

Constructed example: "The catalyst was reduced in hydrogen at 400 °C for 2 h. We chose this temperature because the nickel oxide peak disappears from the temperature-programmed reduction trace at 380 °C."

## 4. Claims and evidence

Numbers. Headline results are stated as a number with a unit and a comparison factor against a named baseline in 12 of 41 blocks (for example 0802.2389: tenfold mobility gain over substrate devices; 1004.0546: luminescence gain of more than 1000 over the bulk; 1512.03385: 3.6 billion operations, 18 % of a named larger network; 1411.4038: millisecond timings and a speed-up factor; 0709.1916, q-bio/0512013, 2106.11799).

Uncertainty. An explicit uncertainty (± value, error bound or stated error estimate) appears in 5 of 41 blocks (1308.6483, 1003.1466, 0909.0948, 0802.2389, astro-ph/0009005). Two of these also explain how the error was obtained (0909.0948: half the difference between two model results, added in quadrature; 0802.2389: an upper bound from the probe geometry).

Unquantified comparatives. "Significantly better", "much more efficient" or "significant improvements" without a number in the same passage appear in 7 blocks (1609.03499, 1003.1466, 1709.10010, 1609.04153, 2106.11799, physics/0506133, 1505.04597). In 1609.03499 and 1512.03385 such statements point forward to experiments ("We show by experiments (Fig. N)").

Strength. Hedges sit at three places: the attribution of a mechanism ("probably indicates", cond-mat/0503533; "could be impurity luminescence", 1004.0546), the generality of a method ("appears not to influence the results", cond-mat/0308217; "we make no guarantee that this is the optimal value", 1202.3665) and assumptions ("a reasonable but unproven assumption", 1308.6483). These three placements were found in 10 blocks (0909.0948, 1308.6483, 1004.0546, cond-mat/0503533, cond-mat/0308217, 1202.3665, 1512.03385, astro-ph/0009005, q-bio/0512013, 1801.00862). Hedges are absent from procedure steps and proofs: the proof blocks state each step without modality. Three blocks have no hedge word at all (1706.02216, 1707.00027, 1409.0575). Strong unhedged verbs ("we prove", "demonstrates convincingly", "clearly demonstrate") appear in 4 blocks (0709.1916, 0802.2389, physics/0506133, 0909.0948).

Constructed example: "The rate falls by a factor of 3.2 ± 0.4 when the particle size doubles, which points to pore diffusion control. A change in the active-site density could give a similar fall, and we have not excluded it."

## 5. Terms and definitions

A new term is introduced by a naming verb ("called", "we call", "we refer to as", "known as", "we define ... as") in 18 of 41 blocks (for example 1411.4038, 1810.04805, cond-mat/0308217, physics/0506133, 1406.5823, math/0610840). The common order in 12 of these is name, then a one-sentence definition, then a concrete case (cond-mat/0308217, 1202.3665, 1609.03499, physics/0506133, 0906.0612, 0709.1916). Where a field term has competing names, the text states the alternatives once and then keeps one (cond-mat/0308217 keeps "edge betweenness" after noting an older name; 1609.03499 lists the alternative names of the dilated convolution once).

Constructed example: "We call this quantity the approach temperature: the difference between the hot-stream outlet temperature and the cold-stream inlet temperature. For a cooler with water entering at 25 °C and process fluid leaving at 35 °C, the approach temperature is 10 K."

A symbol glossary directly after an equation ("where x is ..., y denotes ...") appears in 10 blocks (1609.03499, 1505.04597, 1609.02907, 1411.4038, 0709.3906, 1512.03385, 0802.2389, q-bio/0512013, 1406.5823, 0909.0948). Two blocks explain a concept by an everyday analogy before any symbol: 1801.00862 (a book read page by page) and 0709.1916 (distance between countries counted as intermediate countries).

Reuse is strict in the strongest method texts: the defined term is repeated as the same noun phrase across a whole section ("betweenness" in cond-mat/0308217, "k-clique-community" in physics/0506133, "residual function" in 1512.03385).

## 6. Connectives and cohesion

Three devices carry most of the cohesion.

Noun repetition is the main link in the method blocks (impression, strongest in cond-mat/0308217, 1512.03385, 0709.1916 and 1409.0575).

"This/These" at sentence start: the mechanical count finds a bare "This/These + verb" opener at least once in 26 of 41 blocks (for example 1603.04467: "This allows", "This ensures", "This makes"; 1308.6483, cond-mat/0308217, 0709.1916). "This + noun" ("This reformulation", "This mapping", "This heuristic") is used where the antecedent is a whole clause, in 1512.03385, q-bio/0512013, 1603.04467, physics/0506133 among others. The corpus median for bare openers is 2.0 % of sentences, so the bare form is present but not dense.

Explicit connectives: about 8 % of body sentences open with a listed connective (corpus median). "Thus", "Hence" and "Therefore" carry the derivations; "However" carries the turns in related work and reviews (2304.03442 and 1706.02216 open 3–4 sentences each with it). Enumeration with "First, ... Second, ..." structures reasons or differences in 10 blocks (1202.3665, 1609.03499, cond-mat/0308217, cond-mat/0503533, 1801.00862, 1810.04805, math/0502327, 1707.00027, 1104.4345, 1405.0301).

Signpost nouns that name the main point ("The key feature above is", "The crucial point, however, is", "The key point is", "the critical step") appear in 6 blocks (0802.1189, 0709.1916, math/0502327, 2304.03442, cond-mat/0503533, cond-mat/0702595).

## 7. Differences between groups

Condensed matter and the letter-style texts in physics and biology (0802.2389, 1004.0546, 0805.2850, cond-mat/0503533, physics/0506133, 0709.1916) put the result number early, describe preparation in the passive, and walk through figures with "Figure N shows ..." sentences. Figure-led sentences occur in 12 blocks overall, 9 of them from condensed matter, astrophysics, physics (other) and quantitative biology.

Machine learning (1609.03499, 1512.03385, 1505.04597, 1609.02907, 1810.04805, 1411.4038) uses short subsections, one per design component, a high "we" rate, design reasons stated as "to"-clauses, and qualitative claims backed by a forward pointer to experiments.

Mathematics and statistics (0805.4471, 1104.4345, math/0502327, math/0610840, 0709.3906) use imperative set-ups, "Note that" and "It is worth noticing" remarks, the highest symbol density (99–241 [MATH] markers per 1500 words) and a restatement in words after a result.

Astrophysics reviews (0909.0948, 1308.6483, astro-ph/0009005) tell the history of a measurement through named authors and years, state uncertainties, and use evaluative adjectives about prior work ("unrealistic model", "too simplistic").

Software and resource papers (1411.1607, 1603.04467, 1709.10010, 1405.0301, 1406.5823, 1707.00027, 2106.11799) organise by feature lists and are the main source of the promotional and pointer-only habits in Section 8.

## 8. Weak patterns

Overloaded sentences with nested parentheses and lists inside one clause: 5 blocks (1405.0301, 1709.10010, astro-ph/0009005, 0909.0948, 2304.03442). In 1405.0301 the crude mean sentence length is about 31 words.

Promotional wording: 6 blocks (1609.04153: "revolution", "unprecedented"; cond-mat/0702595: "cornucopia", "gold rush"; 1411.1607: "a joy to use"; 2106.11799: "the only tool capable"; 2304.03442: "north star"; 1003.1466: an efficiency claim with no data at that point).

Unquantified comparatives: 7 blocks (Section 4).

Templated repetition of whole sentence frames across sibling subsections: 1409.0575 (three task subsections share the same four-sentence frame) and 1707.00027 (the same figure sentence used twice).

Pointer-only content, where a subsection says little beyond "see Appendix" or "see Section": 1405.0301, 1603.04467, 1707.00027.

Abbreviations used without expansion in the read text: 4 blocks (1709.10010, 0802.1189, 1405.0301, astro-ph/0009005).

Vague attribution: 2304.03442 ("Many have moved on, arguing ...").

## 9. Comparison with the house rules

Rules the strong texts follow:

- Symbols defined at first use, next to the equation (Section 5 of the rules): 10 blocks with a full glossary after the equation (1609.03499, 1512.03385, 1609.02907, 1505.04597, 0709.3906 and others listed above).
- Abbreviation next to its full form at first use: followed in most letter texts (1004.0546, 0805.2850, 1308.6483).
- Derivation steps with physical meaning (Section 7 of the rules): 2507.01682, 0802.1189, cond-mat/0308217, 1609.02907, q-bio/0512013, 1512.03385.
- Bullets for parallel items only: the lists in 1405.0301, 1709.10010, 1411.4038 and cond-mat/0308217 are parallel items or algorithm steps.
- Separation of verified and inferred statements, and naming what was not checked (Section 2 of the rules): 0909.0948, 1004.0546, q-bio/0512013, 1202.3665.
- Term consistency over synonym variety (Section 4 of the rules): cond-mat/0308217, physics/0506133, 1512.03385.

Rules the strong texts break:

- "No argumentative framing and no rhetorical connectives": the 6 signpost blocks in Section 6 (0802.1189, 0709.1916, math/0502327 and others) name the main point explicitly. In these texts the signpost marks the step that the rest of the passage depends on; it does not replace evidence.
- "Avoid stock negative parallelisms": the "not X but Y" form states the central finding in 5 blocks (0709.1916, q-bio/0512013, 1801.00862, cond-mat/0308217, 2507.01682). In each case the contrast is the result itself, not decoration.
- "No throat-clearing at the start of a section": "In this section we ..." openers occur in 10 blocks (2304.03442, 1609.02907, 1603.04467, 0906.0612, 1810.04805, 0805.4471, 1104.4345, 1405.0301, 1409.0575, math/0502327). Two of these state the claim of the section in the same sentence (math/0502327, 1609.02907); the others only announce the topic.
- "No second-person asides in documents": 3 blocks address the reader as "you" (1801.00862, math/0312448, 1411.1607); cond-mat/0308217 addresses the reader in the third person ("For the reader who merely wants to know ...").
- "No statement of origin": 1801.00862 opens with the author's background; 1706.02216 and 0909.0948 state publication history or forthcoming papers.
- "No hype": the 6 promotional blocks in Section 8.
- "Every modelling choice has a citation": 1003.1466 sets parameter values as "typically" taken, without a source; 0909.0948 states one error choice as "somewhat arbitrary", which is honest but uncited.

The rules on short evaluative sentences and rhetorical questions are not covered by the house rules. Both are used in the readable blocks of this bundle (9 and 8 blocks respectively) and are always followed at once by the explanation they announce.
