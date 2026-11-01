# Figure and table captions in highly cited STEM papers

## Corpus and counting method

The paper bundle holds caption blocks from 122 papers in seven arXiv groups (astrophysics 15, computer science and EESS 20, condensed matter 19, machine learning 20, mathematics and statistics 18, physics (other) 15, quantitative biology 15). All 122 blocks were read. Ten blocks (0803.0547, 1001.4538, 1009.1622, 1502.01583, astro-ph/0505010, cond-mat/0106096, 1409.0575, 2103.00020, 0906.0612, 1405.0301) arrive as one run-on line and were split at the caption separators, which gives 1,088 captions. The company bundle holds 61 captions from 18 posts (Anthropic 6, Google DeepMind 9, Google 2, OpenAI 1).

Counts marked "counted" come from regular-expression and spaCy passes over the split captions, checked by reading. They are lower bounds, because extraction removed figure labels in most papers and cut some captions short. Counts are per document ("in 61 of 122") unless a caption count is stated. The measured features are the medians in `metrics_summary.csv` (paper captions, n = 110 documents with at least two captions of four or more words). Statements marked "impression" were not counted.

Table captions are mixed in without a marker. A caption was treated as a table caption when it names columns, rows, bold entries or "lower is better", or when its wording ("Dataset statistics", "Summary of results") matches a table that the text cites as a table. This identification is partial.

## 1. Structure

### Sequence of moves

The dominant caption has three moves, in this order:

1. A nominal head that names what is plotted, often with "as a function of" and the conditions.
2. A key to the encoding: panels, line styles, colours, symbols.
3. Optional closing sentences: a result read off the plot, a caveat, or a pointer to the text.

Counted: the first sentence has no finite verb in 87 % of captions (metrics, cap_first_noverb median 0.871, IQR 0.667–1). By document, 49 of 122 have no caption at all whose first sentence carries a finite verb, and 73 have at least one. A panel key ("(a)", "Left:", "Top panel:") appears in 87 of 122 (for example 0803.0547, 1308.6483, 0805.2850, q-bio/0512013). A line-style or colour key appears in 61 of 122 (0802.2389, 1710.05832, 1207.7235, astro-ph/0009005). A closing result or comparison sentence ("than", "compared with", "relative to", "outperforms") appears in 65 of 122 (1708.01492, 1507.04544, 2103.00020, q-bio/0512013).

Constructed example: "Outlet temperature as a function of coolant flow rate for three feed compositions. Solid lines, model; circles, measurements. The model overpredicts the hot-spot temperature by about 4 K at the lowest flow rate."

A second form puts the result first, as a headline sentence, and then describes the plot. Counted: 14 of 122 documents have at least one caption that opens with a result claim (2212.04356, 2103.00020, 1411.4038, 2308.04079, 2304.03442, 1706.03762, 0906.0612, cond-mat/0308217, 1403.6652, 1405.0312, 0709.1916, 1609.04153, 1506.01497, q-bio/0512013). Only 2212.04356 and 2103.00020 use it for most of their figures; 1411.4038 and 2308.04079 use it for about half. Nine of the 14 are machine learning or computer science papers from 2014 or later.

Constructed example: "Insertion sort is faster than merge sort below 30 elements. Mean run time of 1,000 trials on random integer arrays; error bars show one standard deviation."

A third form is the topic-colon head ("Stack loss example: ...", "Top panel: ..."), counted in 29 of 122 documents with the label prefix included, and used repeatedly in 1507.04544 (10 captions), 1509.06555, astro-ph/0009005 and 1406.5823.

### Length

Counted: median caption length 42 words (IQR 16–71) over 1,088 captions. Per document, the median of caption medians is 51 words and 3 sentences (IQR 2–5). Metrics give 22.5 sentences and 381 words per document's full caption set, mean sentence length 16.9 words, and a first sentence of 13.1 words. No sentence in the median document exceeds 40 words (long40_share median 0). Captions over 150 words occur in 29 of 122 documents (53 captions; 1405.0301, q-bio/0512013, cond-mat/0008064, cond-mat/0509355, 1507.04544). Captions of five words or fewer occur in 32 of 122 documents (103 captions; 1403.6652, 1307.6212, 1409.4842, 1609.02907, hep-ph/0603175), most of them table titles or algorithm boxes.

## 2. Paragraphs

A caption is one paragraph (impression; extraction may have removed breaks). The few internal breaks that survive fall at panel letters (physics/0506133, 1111.6097, math/0409186, math/0503066).

Opening: the nominal head, starting with the measured quantity or with a genre noun ("Distribution of", "Comparison of", "Schematic of", "Illustration of", "Example of"). Impression: the quantity comes first and the conditions trail in prepositional phrases ("for", "at", "in", "with").

Development follows panel order or encoding order. The sentences after the head are short declaratives with the graphical element as subject: "The dashed line shows ...", "Open symbols denote ...". Counted: a "line/curve + verb" sentence of this type appears in 13 of 122 documents with 30 instances (1207.7235, 1001.4538, astro-ph/0009005, astro-ph/0505010, 1009.1622), and "shows/plots/depicts" with a graphical subject in 62 of 122.

Closing: either the last key item, or one sentence of interpretation. Counted: "Note that" or "Notice" opens a closing remark in 29 of 122 (cond-mat/0503533, cond-mat/0509330, cond-mat/0008064, 0803.0476). A pointer to the text ("see text", "described in the text", "see Section") appears in 21 of 122 (math/0608017, q-bio/0512013, cond-mat/0509355, 0803.2392).

Hand-over between captions: one caption refers back to another. Counted: "Same as Fig. X", "As in Fig. X" or "Otherwise as Fig. X" appears in 13 of 122 (27 captions; astro-ph/0009005, 1002.4734, math/0307152, 0805.4471, 1001.4538). In 10 of 122 a series of at least three captions shares the same first five words (1405.0301, 1403.6652, 1207.7235, 2105.05537, q-bio/0402017), which gives a parallel template across a figure series.

## 3. Sentences

### Information flow

The head phrase puts the measured quantity in the subject or head-noun slot and the conditions at the end. Later sentences take a graphical element as known subject (the line, the panel, the shaded region) and put the new information, the meaning of that element, in the final position.

Constructed example: "The shaded band marks the 95 % confidence interval of the fit."

In result-first captions the subject is the method or system name and the stress position holds the comparison or the size of the effect (2103.00020, 2212.04356, 1706.03762).

Constructed example: "The staggered-tube design lowers the pressure drop by 18 % relative to the inline design."

### Length and rhythm

Counted: mean sentence length 16.9 words, spread sd 8.6 words, coefficient of variation 0.53 (metrics). Impression: a 10–20-word head is followed by shorter key sentences of 6–12 words; the longest sentences are lists of datasets or conditions joined by commas and semicolons (1405.0301, 1105.0828, 1507.04544).

### Voice and "we"

Counted: passive voice in 20 % of caption sentences (metrics, passive_share median 0.197, IQR 0.091–0.283), lower than in methods sections (0.293). Passive "is/are shown/plotted/given/indicated" appears in 55 of 122 documents (114 captions; 1105.1186, astro-ph/0009005, 1212.5226). It is used for the key ("Measurements are shown as circles").

"We" is rare: 1.46 per 1,000 words (metrics; IQR 0–7.92), against 10–20 in body sections. It occurs at all in 61 of 122 documents, and as the first word of a caption in 8 of 122 (1403.6652, 1608.04644, 2304.03442, 2308.04079, 1405.0312, 1409.0575, 1411.4038, 0803.0476). "We show/plot/compare/report" appears in 18 of 122 (0803.0547, 1409.0575, astro-ph/0505010, 1001.4538). "We" is used for a procedure step or a choice made by the authors.

Constructed example: "We averaged the wall heat flux over the last 200 time steps."

### Openers

Counted from first words: genre nouns ("Comparison", "Distribution", "Illustration", "Schematic", "Example", "Results", "Performance") and the article "The" are the most frequent. Panel openers ("Top:", "(a)", "Left:") open captions in 87 documents where panel keys occur (impression for the opener position).

## 4. Claims and evidence

### Numbers and units

Counted: a number with a unit appears in 33 of 122 documents (98 captions; 0805.2850, cond-mat/0410550, cond-mat/0509355, 1303.3997, 1708.01492). The numbers are conditions (temperature, frequency, sample size, run time) more often than results (impression).

### Uncertainty

Counted: some uncertainty statement (±, CL, confidence, standard deviation or error, percentile, quantile, interval) appears in 37 of 122 (113 captions; 0803.0547, 1708.01492, 1206.2332, q-bio/0512013, 1212.5226). A named confidence level (68 %, 95 %, 99 %) appears in 12 of 122 (1207.7235, 1212.5226, 2212.04356, 2103.00020). The phrase "error bars" with a definition appears in only 5 of 122 (q-bio/0512013, 1010.3775, 1001.4538, astro-ph/0505010, 1207.7235). Astrophysics leads (10 of 15); condensed matter has the fewest (2 of 19).

### Sample count and averaging

Counted: a sample count or averaging statement ("averaged over five runs", "100 trials", "n = 250") appears in 25 of 122 (0810.3286, q-bio/0512013, 1305.4022, 0802.2389, 1004.0546). Mean or median as a stated statistic appears in 32 of 122.

### Baselines

Counted: an explicit comparison word appears in 65 of 122. Impression: in ML captions the baseline is a named prior method; in physics captions it is an analytic result, a simulation, or a reference data set.

Constructed example: "Computed Nusselt numbers (circles) compared with the Dittus–Boelter correlation (line)."

### Strength and hedging

Counted: hedge words occur at 0.89 per 1,000 words (metrics; IQR 0–3.06), below every body section (3–7). They appear in 53 of 122 documents, mostly "approximately" as a quantity qualifier (1308.6483, cond-mat/0503533, 1010.3775). Evaluative words without numbers ("excellent", "dramatically", "significantly", "much better") appear in 36 of 122 (q-bio/0512013, 0710.3820, 1111.6097, 0709.1916). "Clearly" or "obviously" appears in 13 of 122 (0710.3820, cond-mat/0702595, 2206.14220, 0803.0476). Impression: the key sentences are unhedged statements of fact; hedges appear only where the caption interprets.

## 5. Terms and definitions

Counted: a symbol is defined inside the caption ("[MATH] is the", "[MATH] denotes") in 30 of 122 documents (64 captions; cond-mat/0008064, 0803.2392, q-bio/0512013, 1001.4538, 0810.3286). An abbreviation is spelled out next to its short form in 25 of 122 (0905.1712, cond-mat/0509355, 1412.6980, 1803.07355, 2206.14220). Impression: the remaining documents use symbols and abbreviations from the body text without definition, so most captions cannot be read alone.

Constructed example: "Pressure drop, Δp, across the bed as a function of superficial velocity, u, for particle diameter d_p = 3 mm."

Within a caption, the head's noun is repeated in the key and the closing sentence. Across a figure series, the head is repeated with one changed word (1405.0301, 1207.7235, 2105.05537). Citations inside captions ([CITE] or "et al.") appear in 50 of 122 (1308.6483, 1201.0490, 1708.01492, 0906.0612, 1405.0301); reprint or image credits in 14 of 122 (0906.0612, 0805.2850, 1609.04153, cond-mat/0106096).

## 6. Connectives and cohesion

Counted: sentence-initial connectives are almost absent (connective_open median 0, IQR 0–0.0014 in metrics), and bare "This/These" + verb openers have median 0. Cohesion comes from three devices, all impression unless counted elsewhere:

- Repetition of the graphical noun ("line", "panel", "band") as the subject of consecutive sentences.
- Spatial and panel labels ("Top:", "(b)", "left"), counted in 87 of 122.
- Parallel clause frames in lists of encoding: "solid, model; dashed, measurement".

Constructed example: "Top: temperature profiles at three times. Bottom: heat flux at the wall for the same times. Solid lines, numerical solution; symbols, analytic solution."

Parentheses carry definitions, units, panel letters and colour keys: 28.5 per 1,000 words (metrics; IQR 14.4–45.6), against 8–13 in body sections. Semicolons separate key items (median 0, IQR 0–4.21 per 1,000 words).

## 7. Differences between groups

Counted, medians per group of document-median caption length and share of captions with a finite verb in the first sentence:

| Group | Docs | Words per caption | First sentence with verb | Panel key | Uncertainty |
|---|---|---|---|---|---|
| Astrophysics | 15 | 71 | 0.11 | 13 | 10 |
| Computer science and EESS | 20 | 26 | 0.17 | 11 | 4 |
| Condensed matter | 19 | 72 | 0.00 | 17 | 2 |
| Machine learning | 20 | 31 | 0.13 | 16 | 7 |
| Mathematics and statistics | 18 | 41 | 0.00 | 12 | 4 |
| Physics (other) | 15 | 61 | 0.11 | 8 | 3 |
| Quantitative biology | 15 | 101 | 0.00 | 10 | 7 |

Quantitative biology and condensed matter captions are the longest and most panel-driven; they carry methods and conditions in the caption (0709.1916, q-bio/0512013, cond-mat/0509330). Condensed matter keeps the "Figure N." or "FIG. N:" label in 9 of 19 documents (0802.2389, 0805.2850, cond-mat/0509355), against 1 of 20 in machine learning. Machine learning and computer science captions are the shortest and the only ones with a repeated result-first headline (2212.04356, 2103.00020, 1411.4038). Mathematics captions often name an algorithm or a table in a few words (1406.5823, 0803.2392, 1111.4246). Astrophysics captions carry the most confidence levels and colour keys (0803.0547, 1212.5226, 1502.01583).

## 8. Company captions

Counted on 61 captions from 18 posts. Captions are shorter: median 24.5 words per post (IQR 12.9–33.3), 1.5 sentences. The first sentence carries a finite verb in a median 55 % of a post's captions (12 of 18 posts at 50 % or more), against 11 % in papers; the metrics give cap_first_noverb 0.5 against 0.871. Typical openers are a full declarative claim (anthropic-11, deepmind-04, google-12) or a genre phrase with a participle, "Diagram showing" or "Bar graph showing" (anthropic-09, deepmind-02, deepmind-09, deepmind-11).

None of the 18 posts states an uncertainty, a sample count or a symbol definition. Line-style or colour keys appear in 2 of 18 (deepmind-01, deepmind-04). Second person appears in 3 of 18 (anthropic-08, google-11, google-12). In 2 of 18 the "caption" is a name and job title under a quotation (deepmind-01, deepmind-11, 8 lines in all), and in 1 an image credit (deepmind-12). Impression: company captions narrate a process step by step in present tense (anthropic-09, deepmind-05, deepmind-09), and the best of them read as one plain sentence about what the reader sees.

Constructed example: "The controller reads the tank level every second and opens the drain valve when the level passes the set point."

## 9. Weak patterns

- Labels without content. 32 of 122 documents have captions of five words or fewer (1403.6652, 1307.6212, 1409.4842, 1609.02907, 1603.04467). A reader learns the topic but not the quantity, conditions or encoding.
- Back-reference chains. "As Fig. X, but for ..." or "Comments as before" in 13 of 122 (astro-ph/0009005, 1002.4734, hep-ph/0603175). The caption cannot be read without the other figure.
- Deferral to the text. "See text" in 21 of 122 (math/0608017, cond-mat/0509355, 0803.2392).
- Undefined symbols and abbreviations. Only 30 of 122 define a symbol and 25 of 122 an abbreviation in the caption; impression: most of the rest use undefined short forms.
- Error bars and n left out. Error-bar definitions in 5 of 122; sample counts in 25 of 122.
- Colour-only keys. Impression: many colour keys give no second encoding (line style or marker), for example 2206.14220 and 1405.0312.
- Evaluative words without a number ("excellent", "dramatically", "clearly") in 36 of 122.
- Overlong captions that hold methods or literature reviews: 29 of 122 have captions over 150 words; 1405.0301 lists prior literature in table captions, and 0709.1916 gives the simulation model in a caption.
- Duplicated captions: identical captions for different figures in 1608.04644 (three) and hep-ph/0603175 (two).
- Promotional or conversational headlines in a few captions (cond-mat/0702595, q-bio/0402017, 1411.1607; impression).

## 10. Comparison with the house rules

The house rules (writing-style.md, Section 10) ask for "Fig. N | Takeaway sentence.", then, in order, what is shown, symbol definitions, conditions, n, and the error-bar definition, and a figure and caption that are understandable without the main text.

Rules the strong texts follow:

- What is shown and the encoding key: followed by the majority (panel keys 87 of 122, line or colour keys 61 of 122). The order "what is shown, then key, then conditions" matches the common caption (0803.0547, 1212.5226, 1207.7235, q-bio/0512013).
- Symbol definitions in the caption: followed by 30 of 122 (cond-mat/0008064, 0803.2392, 0810.3286).
- Conditions: given by most captions in physics, astrophysics and biology (1708.01492, 1303.3997, 0802.2389).
- n and error-bar definitions: followed only by a minority (n in 25 of 122, error-bar definitions in 5 of 122; q-bio/0512013, 1010.3775, 1207.7235 do both).
- Abbreviations next to their full form (Section 5): 25 of 122 (0905.1712, 2206.14220).
- Low hedging and no sentence-initial connectives: followed by almost all (metrics medians 0.89 hedges per 1,000 words, connective_open 0).

Rules the strong texts break:

- Takeaway sentence first: broken by most. 14 of 122 open any caption with a result claim, and only 2212.04356 and 2103.00020 do so for most figures. The common caption opens with a nominal description (87 % of first sentences have no finite verb).
- The "Fig. N |" label format: no document uses it; 24 of 122 keep a "Figure N." or "FIG. N:" label in the extracted text, and the rest lost the label to extraction, so the format cannot be judged.
- Self-contained captions: broken by back-reference chains (13 of 122) and "see text" (21 of 122).
- "No filler prose": "Note that" in 29 of 122; evaluative words without numbers in 36 of 122.
- Second-person asides (Section 2): in company captions 3 of 18; absent from the paper captions read.

The strongest captions in the bundle combine the house order with a result sentence at the end in place of the start: a nominal head, a full key, conditions, n and uncertainty, and one quantitative closing sentence (q-bio/0512013, 1207.7235, 1212.5226, 1708.01492). The result-first headline of 2212.04356 and 2103.00020 is the closest match to the house "takeaway sentence", but those captions seldom give n or error-bar definitions.

Constructed example in the house form: "Fig. 3 | The packed bed reaches steady state within 40 s at all three flow rates. Outlet concentration, c (mol/m³), against time, t (s), for superficial velocities of 0.1, 0.2 and 0.4 m/s (solid, dashed and dotted lines). Bed length 0.5 m, inlet temperature 350 K. Each curve is the mean of n = 5 runs; shaded bands show ±1 standard deviation."
