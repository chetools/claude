# Methods sections, bundle part 2: style analysis

## Scope and reading conditions

The bundle holds the methods sections of 33 documents: astrophysics 6, computer science and EESS (other) 7, condensed matter 2, machine learning 6, mathematics and statistics 4, physics (other) 3, quantitative biology 5. All 33 were read in full as given. Eighteen excerpts stop at the 1500-word cap (for example 0909.0948, 1304.6875, 2103.00020, 1708.01492, hep-ph/0201195), so statements about how a section closes rest on the 15 complete excerpts. In 18 excerpts the paragraph breaks were lost in extraction (one block per document, for example 0909.0948, 1502.01583, 1411.4038); paragraph statements rest on the 15 documents with breaks kept (for example 1409.1556, 1706.03762, 1303.3997, q-bio/0502035). Code listings were removed in 1102.1523 and 1111.6097, which leaves sentences that point at missing code.

Counts below are my own tallies over the 33 documents. Where a statement is an impression and was not tallied, it says so. The measured features come from `metrics_summary.csv`, row `paper,methods` (n = 67, both bundle halves together; median with interquartile range in brackets). That row is quoted where it bears on a pattern; it does not describe this half alone.

The methods units are of five kinds. Procedure or pipeline sections (observation, training, alignment, data processing): 14, for example 1304.6875, 1005.4917, 1409.1556, 1303.3997. Architecture or system descriptions: 6 (1603.04467, 1706.03762, 2105.05537, 1609.04153, 1111.6097, 1102.1523). Derivations, proofs and estimator definitions: 10 (0805.4471, 0810.3286, 1203.6372, 1305.4022, 1507.04544, 1202.3665, cond-mat/0106096, q-bio/0502035, 1603.02754, 1608.04644). Validation against independent data: 2 (0909.0948, 1502.01583, the latter overlapping with procedure). Outliers: math/0312448 (how to use a database) and 1004.4170 (idealised rules of a heuristic).

## 1. Structure

The usual sequence of moves is: (a) a statement of what the section covers or of the object it treats; (b) definitions and notation; (c) the procedure in execution order; (d) a reason for each non-obvious choice; (e) a check, or a number showing the step works; (f) a limitation or an alternative that was tried. Counts per move:

- (a) An explicit signpost sentence opens the section in 12 of 33 ("In this section we ...", "This section introduces ...", "We now introduce ..."): 1502.01583, 1403.6652, 1409.1556, 0810.3286, 1507.04544, 0803.0476, hep-ph/0201195, 1203.6372. The other 21 start with the object itself, a definition or a problem statement: 1603.04467, 1706.03762, q-bio/0502035, 1303.3997, 1304.6875.
- (b) Symbols are defined in a "where" clause directly after a displayed equation in 17 of 33: 1305.4022, 1203.6372, 0803.0476, q-bio/0502035, 1708.01492.
- (d) A reason for at least one choice, given with "because", "since", "to" plus purpose, or a citation, appears in 31 of 33. The two exceptions are cond-mat/0106096 (a review of theory, no choices) and 1004.4170 (choices justified only by "for simplicity").
- Concrete settings (default values, hyperparameters, temperatures, thresholds) are stated in 18 of 33: 1409.1556, 1411.4038, 1303.3997, 1005.4917, 2304.03442.
- (e) An in-section check or performance number appears in 15 of 33: astro-ph/0009005 (the input distribution is recovered from synthetic samples), 1708.01492, 1603.02754, 1411.4038, 0909.0948.
- (f) A stated limitation or failed alternative appears in 15 of 33: 1203.6372, 1708.01492, 0803.0476, 1411.4038, 1502.01583.

The full (a)–(f) sequence is complete in 7 documents (1304.6875, 1411.4038, 1708.01492, 1303.3997, 0803.0476, 1502.01583, 2103.00020); all are procedure or pipeline sections. Derivation sections replace (c)–(e) with assumption, definition, result and proof (0805.4471, 0810.3286, 1203.6372).

Length. Complete excerpts run 315–1374 words, median 983 (15 documents). The metrics row gives a median section of 1.85e+03 words [1.01e+03, 3.02e+03] and 89 sentences [44, 147], with paragraphs of 81.8 words [60.6, 102]. Where breaks survive, paragraphs hold 3–7 sentences (impression from the 15 documents with breaks).

Subsection structure is dense. In 26 of 33 the section is cut into named subsections of one to four paragraphs each, one per component or step (1706.03762, 2105.05537, 1303.3997, 1203.6372, q-bio/0502035). Seven use run-in labels in place of headings, a short noun phrase followed by the paragraph ("Optimization", "Class balancing", "Pairing"): 1411.4038, 1609.04153, 1405.0312, 1608.04644, 1708.01492, 1706.03762, 2304.03442.

## 2. Paragraphs

Opening. A paragraph most often opens by naming the component, step or quantity it treats, as subject of the first sentence (impression, strong in 1706.03762, 1603.04467, 1303.3997, q-bio/0502035, 2304.03442). A second common opener is a purpose clause ("To reduce ..., we ...") or a condition ("Given ..., the ..."); see section 3 for counts.

Constructed example: "The condenser is a shell-and-tube unit with water on the shell side. Cooling water enters at 25 °C and leaves at 35 °C, which fixes the water flow at 12 kg/s for the design duty."

Development. The middle of a paragraph runs in execution order: input, operation, output, then the parameter values. Derivation paragraphs instead state the claim, give the step, and name the property that licenses the step (0805.4471, 0810.3286, 1708.01492).

Closing. Among the 15 documents with paragraph breaks, the last sentence of a paragraph is most often one of three kinds (impression): a consequence of the step ("This reduces the cost from quadratic to linear"), a reason for the choice, or a pointer to where the step is evaluated ("We discuss the effect in Section 5"). Closing on a summary of what was just said is rare. Short evaluative closers do occur and are weak (see section 8): 1202.3665 ends its section on "extremely powerful", 1603.02754 on a sentence that the result "confirms the importance" of the method.

Hand-over. The next paragraph usually picks up the output of the previous step as its subject (impression; clear in 1706.03762, 1303.3997, 1708.01492, 1609.04153). Ordinal connectives carry the hand-over in 9 of 33 ("First ... Second ...", "Firstly ... Secondly ..."): 0805.4471, 1403.6652, 1303.3997, 1507.04544, 1409.1556.

Constructed example: "The second stage splits the feed into vapour and liquid. The vapour is compressed to 20 bar before it enters the reactor."

## 3. Sentences

Length and rhythm. The metrics row gives a mean of 21.4 words per sentence [19.5, 23.8], a coefficient of variation of 0.517 [0.456, 0.578] and a share of sentences over 40 words of 0.0629 [0.029, 0.0963]. Sentences are therefore moderate in length, varied, and rarely very long. In reading, the short sentences carry the operation or the setting ("We train by SGD with momentum.", 1411.4038; similar in 1706.03762, 1303.3997) and the longer ones carry the reason or the condition. This alternation is an impression, strongest in 1411.4038, 1706.03762 and 1409.1556.

Information flow. The subject is usually given information: a component already named, the output of the previous step, or a defined symbol. The new item sits at the end: the value, the purpose or the consequence (impression across the procedure sections; clear in 1409.1556, 1303.3997, 1005.4917). Settings in particular follow the frame "known quantity, verb, value".

Constructed example: "The reflux ratio was set to 1.4 times the minimum."

Openers. Purpose-first openers ("To ...", "In order to ...") occur in 22 of 33: 1304.6875, 1409.1556, 1706.03762, 2103.00020, 1305.4022. Condition openers with "Given ..." occur in 7: 1706.03762, 1608.04644, 1708.01492, 1403.6652, 1409.1556. Sentences opening on a listed connective are few: 0.0729 [0.0472, 0.107] in the metrics row.

Constructed example: "To keep the outlet below 80 °C, we split the coolant into two parallel streams."

"We" and voice. The metrics row gives 15.8 occurrences of we/our/us per 1000 words [7.03, 22.2] and a passive share of 0.293 [0.214, 0.436]. In 19 of 33 documents, active "we" dominates (0909.0948, 1304.6875, 1411.4038, 2103.00020, 1203.6372). The division of labour is consistent where both voices occur: "we" goes with decisions, assumptions and arguments ("We assume ...", "We chose ... because ..."), and the passive goes with routine settings and steps whose agent is obvious ("The batch size was set to ...", "Samples were cooled ..."). The split is clear in 1409.1556, 1304.6875, astro-ph/0009005 and 1005.4917. Passive dominates in 4 (1005.4917, astro-ph/0009005, 1409.1556 for training settings, 2105.05537).

A third pattern makes the method or software the grammatical agent, in present tense, in 10 of 33: 1303.3997, 1708.01492, 1603.02754, 1603.04467, 1706.03762 ("The Transformer uses ..."), 2103.00020, 1609.04153, 2105.05537, 1111.6097, 2304.03442. This removes both "we" and the passive from the procedure.

Constructed example: "The sorter reads one block at a time, merges it with the current run and writes the result back to disk."

Tense. Present tense for what the method does and for definitions; past tense for what was done in this study (settings, data collection, observed results). The split is clean in 1304.6875, 1409.1556 and 1411.4038 (impression).

## 4. Claims and evidence

Numbers. Settings are given with units and values in 18 of 33 (section 1). Results inside methods sections take two forms.

- With uncertainty or spread, in 4 of 33: 0909.0948 (abundance differences in dex with combined uncertainties), 1304.6875 (velocities with errors and degrees of freedom), 1502.01583 (residuals per channel), 1507.04544 (a difference with its standard error).
- With a comparison baseline but no spread, in 9 of 33: 1411.4038 (a score against the previous best), 1603.02754 (a speed ratio against a naive version), 1708.01492 (two overlap sensitivities), 1405.0312, 2103.00020.

So 9 of the 13 documents that report performance numbers give no uncertainty. Astrophysics and statistics give spreads; machine learning and software papers give point values against a baseline.

Constructed example with spread: "The fitted heat-transfer coefficient is 410 ± 25 W/(m² K), within 6 % of the Dittus–Boelter value."

Hedging. The metrics row gives 3.03 hedge words per 1000 words [1.39, 5.97]. Hedges sit on explanations of why something works, not on measured values. First-person hedging verbs ("we suspect", "we conjecture", "we hypothesize", "we speculate", "we believe", "we expect") occur in 9 of 33: 0909.0948, 1409.1556, 1706.03762, 1405.0312, 2103.00020, 1507.04544. The measured values next to them are stated flat.

Constructed example: "The run time grows linearly with the input size. We suspect that the cache behaviour of the merge step causes the small rise above 10⁸ records."

Strength. Procedural statements carry no hedges. Assumptions are stated as assumptions and then tested or qualified: 1203.6372 gives each assumption, then a sentence on where it fails; 1708.01492 states the independence assumption, then states that real data violate it and how close the estimate still is.

Constructed example: "We assume that the wall temperature is uniform. Near the inlet this is not true, but the error in the outlet temperature is below 0.5 K."

## 5. Terms and definitions

Naming moves. A new term or method name is introduced by an explicit naming construction in 18 of 33: "We call this ...", "We refer to this as ...", "which we call ...", "known as ...", "so-called ...". Examples: 1603.02754, 1706.03762, 1411.4038, 1608.04644, 1303.3997. The pattern is: describe the object or operation first, then attach the name at the end of the sentence or in the next one. The name is then reused unchanged, often as subject of the following sentences (1411.4038 with its net variants, 1608.04644 with two attack variants, 2304.03442 with "reflection").

Constructed example: "Each pass merges two sorted runs into one. We call this operation a merge pass."

Symbols. Symbols are defined in a "where" clause after a displayed equation in 17 of 33 (section 1), or by "Let ... be ..." before the equation in the derivation sections (0805.4471, 0810.3286, 1203.6372, 1708.01492). Defined symbols are reused without redefinition. Notation tables are mentioned in 1203.6372.

Abbreviations. Most are expanded at first use in the excerpt ("supermaximal exact matches (SMEMs)", 1303.3997). Seven excerpts use at least one abbreviation not expanded within the methods text: 1609.04153, 1502.01583, 1305.4022, 2105.05537, 1203.6372, 1411.4038, 1405.0312. Some of these may be expanded earlier in the paper, outside the excerpt; this was not checked.

Operational definitions. The strongest texts define a computed quantity by its procedure: q-bio/0502035 defines its connectivity score as a deviation from the module mean divided by the module standard deviation, then states what high and low values mean; 1507.04544 defines the standard error as the standard deviation of pointwise terms times the square root of their number; 1502.01583 defines its noise reference by how the half-data maps are built.

## 6. Connectives and cohesion

Noun repetition is the main cohesive device (impression across all 33). The component name or the defined symbol is repeated as subject sentence after sentence; synonyms are not cycled. This is clearest in 1706.03762, 1303.3997, 1708.01492 and q-bio/0502035.

"This" plus noun ("This heuristic ...", "This masking ...", "This simplification ...") links a sentence to the previous one in about 10 of 33: 1303.3997, 1708.01492, 1706.03762, 1305.4022, 0810.3286. Bare "This" followed by a verb ("This means ...", "This allows ...") occurs in about 10 of 33: 1202.3665, 1502.01583, 1403.6652, 1603.02754, 0803.0476. The metrics row gives a bare This/These opener share of 0.0219 [0.00667, 0.034], so about one sentence in 45.

Explicit connectives are sparse: sentence-opening connectives 0.0729 [0.0472, 0.107] in the metrics row. The logical links sit inside sentences instead, in subordinate clauses with "because", "since", "so that", "while" and in purpose infinitives (impression). Ordinals carry step order in 9 documents (section 2).

Lists. Some list (numbered prose steps, itemised steps or cases) appears in 16 of 33. Inline numbered steps "(1) ... (2) ..." or "(i) ... (iv)" occur in 8: 1202.3665, 1005.4917, 1111.6097, 1603.02754, 1409.1556. Itemised steps in imperative mood ("Start with ...", "Add ...") occur in 1502.01583 and 1609.04153.

Punctuation. The metrics row gives em dashes at 0 per 1000 words [0, 0.226], semicolons 0.823 [0, 1.93], parentheses 10.4 [7.62, 15.2]. Parentheses carry defaults and units ("over 28 bp by default", 1303.3997; similar in 1708.01492, 1409.1556).

Constructed example: "The column has 30 trays (sieve type, 0.6 m spacing)."

## 7. Differences between groups

Astrophysics (6). Observational and validation procedures with units, uncertainties and stated systematics (1304.6875, 0909.0948, 1502.01583). Hedged interpretations next to flat measurements. The organisational description in 1609.04153 is the exception: system names and abbreviations as subjects, little "we".

Machine learning (6). Short active "we" sentences for training and architecture choices (1411.4038, 1706.03762, 2103.00020). Naming constructions for new components ("We call ...") in 4 of 6 (1411.4038, 1706.03762, 2103.00020, 1603.02754). Results as point values against a baseline, no spread, in 5 of 6.

Quantitative biology (5). The software is the subject in 2 (1303.3997, 1708.01492), with defaults in parentheses. Assumptions get their own subsections with a sentence on where each fails (1203.6372). Two are derivations with symbol-by-symbol "where" clauses (1305.4022, q-bio/0502035).

Mathematics and statistics (4). Definitions, "Let/Fix/Set" imperatives and proofs (0810.3286), and a worked example with a standard error (1507.04544). The other two are outliers in register (math/0312448, 1004.4170; section 8).

Computer science and EESS, other (7). Mixed: a proof (0805.4471), system concepts defined one per subsection (1603.04467), a tutorial with removed code (1102.1523), attack descriptions led by prior authors as subjects (1608.04644), and a challenge-then-approach layout built on worked scenarios (2304.03442).

Physics, other (3) and condensed matter (2). Step-by-step algorithm description with an order-dependence caveat (0803.0476), a software manual (1111.6097), a data-analysis method section (hep-ph/0201195), a passive fabrication recipe with temperatures and times (1005.4917), and a definitional review (cond-mat/0106096). The groups are too small for group claims.

## 8. Weak patterns

- Stock attention phrases ("It should be noted", "It is worth noting", "It is important to note", "An important note is in order", "Of note") in 7 of 33: 0909.0948 (four such phrases), 1202.3665, 1502.01583, 1608.04644, 1409.1556, cond-mat/0106096, 1305.4022. The sentence works without them.
- Intensified evaluative words in a methods section ("extremely", "remarkable", "excellent", "novel", "amazing", "dissatisfyingly") in 11 of 33: 1202.3665, 1502.01583, 0909.0948, 0803.0476, 1603.02754, 0810.3286. They replace a number that would say the same thing.
- Performance numbers with no spread: 9 of 13 (section 4).
- Unexpanded abbreviations in the excerpt: 7 of 33 (section 5).
- Draft text left in the published version: 1403.6652 keeps a first-person note on what the authors want to show, and an incomplete sentence after it.
- Grammar errors that slow reading: 2105.05537, 1603.02754, 1004.4170.
- Forward pointers with no content ("we elaborate each block in the following") with no colon or list after them: 2105.05537.
- Repeated justification by "for simplicity" with no statement of what is lost: 1004.4170 (six times in the excerpt).
- Anthropomorphism in a method description: 1004.4170 (agents that "know" in an unexplained way).
- Status and history statements inside the method: 1609.04153 (organisation size and history), 1405.0312 (release schedule, unfinished server), 1409.1556 (a finding made after submission), math/0312448 (maintenance and an appeal to readers).
- Single-block paragraphs of several hundred words occur in many excerpts, but this is at least partly an extraction artefact (section on scope) and is not counted as a style defect.

## 9. Comparison with the house rules (`writing-style.md`)

Rules the strong texts follow:

- Define every symbol at or before first use (Section 5). The 17 documents with "where" clauses after equations follow it symbol by symbol, for example 1305.4022, 1203.6372, 0803.0476, q-bio/0502035, 1708.01492.
- Define a computed quantity by what is computed, from what data, in what steps (Section 7): q-bio/0502035, 1507.04544, 1502.01583.
- Separate verified facts from inference (Section 2): measured values stated flat and explanations hedged with "we suspect" or "we conjecture", in 9 documents (1706.03762, 1507.04544, 0909.0948, 1409.1556, 2103.00020).
- Repeat the correct term instead of cycling synonyms (Section 4): noun repetition is the main cohesive device; the naming constructions in 18 documents fix one name per object (1411.4038, 1608.04644, 1303.3997).
- Citation for each modelling or algorithmic choice (Section 8): the metrics row gives 0.135 citation markers per sentence [0.0514, 0.217], and citations sit at the choice they support in 1409.1556, 1706.03762, 1303.3997, 1708.01492, 1203.6372.
- Low em dash use (Section 4): median 0 per 1000 words.
- Nominal headings (Section 2): 30 of 33 section headings are noun phrases ("Model Architecture", "Split Finding Algorithms"). Exceptions: math/0312448 ("To consult the database"), 1411.4038 ("Combining what and where"), 2304.03442 ("Challenge:" and "Approach:" labels).
- Bullets for parallel items only (Section 6): of the 16 documents with lists, the lists hold parallel steps or cases (1502.01583, 1609.04153, 1706.03762, 1305.4022).

Rules the texts break:

- "Impersonal" register (Section 2). The strong procedure sections use "we" at a median 15.8 per 1000 words and use it for every decision (1411.4038, 1706.03762, 1304.6875). The house rule does not forbid "we" by name, but "impersonal" reads against it; the corpus supports "we" for decisions and the passive or a tool-as-subject for routine steps.
- No "it is important to note" or "worth noting" (Section 4): broken in 7 documents (0909.0948, 1202.3665, 1502.01583, 1608.04644, 1409.1556).
- No hype or promotional wording (Sections 2, 4): broken in 11 documents (1202.3665, 1502.01583, 0803.0476, 1603.02754, math/0312448).
- Abbreviation next to its full form (Section 5): broken within the excerpt in 7 documents (1609.04153, 1502.01583, 1305.4022, 2105.05537, 1411.4038), subject to the excerpt caveat above.
- No origin, status or distribution statements (Section 6): broken in 4 (1609.04153, 1405.0312, 1409.1556, math/0312448).
- No second-person asides and no anthropomorphism (Section 2): broken in math/0312448 ("you", an exclamation), 1102.1523 ("Imagine ...", "let us"), 1004.4170.
- Avoid stock negative parallelisms (Section 4): "not only ... but also" or "not X but Y" in 3 documents (2103.00020, 0810.3286, 2304.03442).
- Numbers with uncertainty and consistent significant figures (Sections 9, 10): 9 of 13 documents with performance numbers give no spread (1411.4038, 1603.02754, 1708.01492, 1405.0312, 2103.00020).

Patterns in the strong texts that the house rules do not yet state: the purpose-first sentence opener (22 of 33), the "describe, then name" order for new terms (18 of 33), settings stated as "known quantity, verb, value" with defaults in parentheses (18 of 33), and an assumption followed by where it fails and by how much (1203.6372, 1708.01492, 0803.0476).
