# Results sections of highly cited STEM papers: bundle part 2

## Material and counting basis

The bundle holds 32 blocks. Each was read in full. Seven of them are not results text in the usual sense: an introduction-style overview (astro-ph/0409513), proofs (1105.1186), a language-design essay with code (1411.1607), a one-sentence placeholder (1603.04467), definitions of evaluation criteria (1409.0575), an appendix followed by a reference list (0709.3906), and a model derivation filed under "Results" (1206.2332). Two more are mostly setup or proof and are cut off before numbers appear (1610.05820, 0810.3286). The remaining 23 blocks report measured or computed results, and they are the base ("23 read") for most counts below. Fifteen blocks stop at the 1500-word cut, 10 of them inside the 23 (for example 1706.02216, 2010.11929, hep-ph/0201195). This means section endings can be judged only for the 13 complete results blocks.

Two kinds of count are given. Counts of words and markers were made with regular expressions per block (script in the session scratchpad, not kept). Counts of moves, openings and claim types were made by reading and are judgements. Statements marked "impression" were not counted.

The measured row for this unit in `metrics_summary.csv` covers all 63 results sections of both halves, not only this bundle:

| Feature | Results (median [IQR]) | Introduction | Methods | Discussion |
|---|---|---|---|---|
| Words per sentence, mean | 19.9 [18.1, 22.1] | 22.4 | 21.4 | 23.3 |
| Passive share of sentences | 0.213 [0.155, 0.286] | 0.25 | 0.293 | 0.215 |
| we/our/us per 1000 words | 19.6 [10.8, 26] | 10.6 | 15.8 | 12.8 |
| Hedge words per 1000 words | 3.48 [2.02, 5.26] | 3.95 | 3.03 | 6.89 |
| Sentences opening with a connective | 0.0667 [0.0385, 0.101] | 0.0863 | n/a here | 0.0893 |
| Bare "This/These + verb" openers | 0.0206 [0, 0.0364] | 0.011 | n/a here | n/a here |
| Parentheses per 1000 words | 12.7 [6.64, 20.2] | 8.24 | 10.4 | 6.33 |
| Em dashes per 1000 words | 0 [0, 0] | 0 | n/a here | 0 |

Results text has the shortest sentences and the highest rate of "we" of any paper prose unit in the summary, a passive share at the low end, and about half the hedge rate of discussion sections. Sentence-length spread is wide (coefficient of variation 0.505), and only 4% of sentences exceed 40 words.

## 1. Structure

The dominant sequence of moves in the 23 results blocks is: purpose of the test, setup restated in brief (data, baseline, metric), the result as a comparison, an explanation or qualification, and then the next test. Counted by reading:

- A purpose or roadmap sentence opens the section in 15 of 23 (1009.1622, 0805.4471, 1506.02640, 2010.11929, hep-ph/0201195). Four open directly on a figure or a number (astro-ph/0006289, 1706.03762, 1409.7208, 1303.3997). Four open with system or data description (1603.02754, 1105.0828, 1207.7235, 1708.01492).
- The result is set against a named competing method in 16 of 23 (1608.04644, 1706.02216, 1505.04597, 1603.02754, 1708.01492). In 6 more the reference is theory, data, a null model or a background hypothesis (0805.4471, math/0409186, 1207.7235, hep-ph/0201195, 1010.3775, astro-ph/0006289). One (1609.04153) gives performance relations with no comparison.
- The section is split into one subsection per task, data set or experiment in 16 of 23 (1706.02216, 2212.04356, 1506.02640, 1105.0828, 1708.01492). The other 7 run as unsectioned prose of 300 to 900 words (astro-ph/0006289, 0805.4471, 1505.04597, math/0409186, 1303.3997, 1409.7208) or with run-in headings (1608.04644).
- A setup block (data sets, hyperparameters, hardware) precedes the first number inside the section in 9 of 23 (1609.02907, 1603.02754, 2010.11929, 1706.02216, 2308.04079).
- None of the 13 complete blocks closes with a summary paragraph. They close on the last result (1505.04597, 1608.04644), a mechanism for it (1506.02640, 1303.3997), or a short implication (1603.02754, 1708.01492, 1409.7208).

Length: the measured median is 80 sentences and about 1400 words, with paragraphs of about 87 words. In this bundle the complete blocks range from 300 words (1409.7208, one paragraph) to about 1400 words (1506.02640, 14 subsections and paragraphs). Short paragraphs of one to three sentences are frequent in the machine-learning and tool papers (1506.02640, 1505.04597, 1603.02754).

Constructed example of the opening move: "This section tests the heat-exchanger model on three plant data sets and compares it with the effectiveness–NTU method and with a finite-volume solver."

## 2. Paragraphs

Opening. In the 23 blocks, the commonest paragraph opener is a sentence that names the test or the object under test as subject, before any number (by reading, the dominant form in 18 of 23; for example 1506.02640, 1708.01492, 1603.02754, 1105.0828). A second common opener points at a display: "Figure/Table [REF] shows/summarizes/compares" occurs 27 times across 12 blocks (counted; 2010.11929 and hep-ph/0201195 have 5 each, 1506.02640 has 3). The display sentence states what is plotted, and the next sentences read it.

Development. Inside a paragraph the order is usually number, comparison, reason. Constructed example: "The new sorter finishes the 10^8-key benchmark in 4.1 s. The library quicksort needs 6.3 s on the same machine. Most of the gain comes from the branch-free partition step, which removes mispredictions on random keys."

Closing. Paragraphs close on a qualification or a caveat more often than on a restated claim (impression, strongest in 1009.1622, astro-ph/0006289, 1708.01492, 2308.04079). Typical closing forms are a limit of validity, a known exception, or a pointer to an appendix.

Hand-over. The next paragraph starts a new test, data set or condition, often with its own name in the first words ("On the second data set", "For the out-of-core case"). Explicit transition sentences between paragraphs are rare (impression). The subsection heading or the new data-set name carries the move in the 16 sectioned blocks.

## 3. Sentences

Information flow. The subject position is held by the method or system name in 10 of 23 blocks, where the program name opens most result sentences (1506.02640, 1708.01492, 1303.3997, 1409.7208, 1603.02754). In the physics and astronomy blocks the subject is more often a measured quantity or a model ("The measured scatter", "The fit", "The excess") (astro-ph/0006289, 1207.7235, hep-ph/0201195, 1009.1622). New information (the number, the ratio, the name of the beaten baseline) sits at the end of the sentence in most result sentences (impression, consistent across these four groups). Constructed example: "At a Reynolds number of 10^4, the predicted Nusselt number lies within 3% of the Gnielinski correlation."

Length and rhythm. Short declarative result sentences (under 12 words) alternate with longer setup or explanation sentences. The short form is most frequent in 1506.02640, 1708.01492, 1303.3997 and 1603.02754, where several consecutive sentences of 8–15 words state one result each. The longer sentences (30+ words) carry conditions, test protocol or the reasoning behind a number (2212.04356, 1009.1622, hep-ph/0201195, 1010.3775). Constructed example of the rhythm: "The coarse grid fails. Its error at the wall exceeds 20%, because the first cell centre lies outside the viscous sublayer at every flow rate tested."

Openers. Prepositional and conditional openers that fix the condition first are common: "On data set X", "For the base model", "At test time", "In the static framework" (counted by reading in 19 of 23; for example 1706.03762, 1708.01492, 1010.3775, 1506.02640). Connective openers are infrequent (measured median 0.067 of sentences). "However" opens a sentence 15 times in the 23 blocks, most in 1105.0828 (4), 1706.02216 (3) and 1506.02640 (3). "Finally" is used to mark the last test in 6 blocks (1009.1622, 0805.4471, 1411.4038, 1603.02754, 2010.11929).

"We". "We" is the normal agent for actions: we trained, we compared, we set, we report. Counted occurrences of "we" range from 0 (1207.7235) to 53 in 1500 words (2308.04079); 1609.02907 has 42 in 1180 words. "We" with a perception verb ("we find", "we observe", "we can see") occurs in 10 of 23 blocks, most in 1706.02216 and 1105.0828 (6 each). The CMS paper (1207.7235) and the Gaia summary (1609.04153) are impersonal throughout.

Voice. Active voice with "we" is used for what the authors did; the passive is used for protocol held constant, for quantities and for displays (by reading, clearest in 0805.4471, 1207.7235, 1609.04153, hep-ph/0201195). Constructed example: "We heated each sample at 5 K/min. The onset temperature was taken as the intersection of the baseline and the tangent at the inflection point."

## 4. Claims and evidence

Number with baseline. In most result sentences the number and its comparison point appear together, either as an absolute pair or as a ratio or difference. Counted by reading, this pairing is the main form in 16 of 23 (1505.04597, 1506.02640, 1706.02216, 2212.04356, 1708.01492). Speed is stated as a multiple ("6 times faster", "[MATH]x slower"): the "times"/"x" pattern occurs 26 times in 8 blocks (counted), with 9 in 1708.01492 and 5 each in 1506.02640 and 1409.7208.

Constructed example: "The packed column reaches 98.5% recovery at 1.2 kPa pressure drop, against 96.0% for the tray column at the same reboiler duty."

Uncertainty. Spread or a significance measure accompanies the numbers in 7 of 23: confidence limits and Monte Carlo errors (astro-ph/0006289), expectation bands and p-values (1207.7235), chi-squared per data point (hep-ph/0201195), standard error over runs (1609.02907), standard deviation and intra-class correlation (1010.3775), stated margins and ranges (1609.04153), and a rank test (1706.02216). In 12 of 23, mainly machine learning, computer science and bioinformatics tools, single values without spread are reported (1506.02640, 1706.03762, 2010.11929, 2308.04079, 1708.01492).

Strength. Measured comparisons are stated without hedges: "outperforms", "is faster than", "achieves". Hedges attach to the explanation of a result, not to the result itself, in 11 of 23 (1603.02754 "could be due to", 1411.4038 "perhaps due to", 2212.04356 "we suspect", 1303.3997 "we speculate", 1010.3775 "likely the cause"). Constructed example: "The second catalyst is 15% more active per gram. The difference may come from its smaller crystallite size, which was not measured independently." The measured hedge rate (3.48 per 1000 words) is half that of discussion sections (6.89).

Scope limits and reproducibility. Explicit statements of what was not tested or why a comparison is unfair appear in 9 of 23 (1608.04644 on runtime, 2212.04356 on text normalization, 2010.11929 on pre-training efficiency, 1105.0828 on dropped variables, 1009.1622 on the purpose of the code comparison).

## 5. Terms and definitions

New metrics and abbreviations are usually defined by a parenthesized full form at first use, then used as the short form: WER (2212.04356), IOU (1505.04597), FNR and FPPM (1708.01492), IU (1411.4038), PPI (1706.02216), ECAL and HCAL (1207.7235). Counted by reading, 12 of 23 define at least one abbreviation this way inside the section.

Metrics are defined operationally in 7 of 23: what is computed, from which counts, with the equation following (1411.4038 for four pixel metrics, 1010.3775 for the intra-class correlation, 1609.04153 for the error relations, 0805.4471 for the recovery criterion, 2010.11929 for few-shot accuracy). Constructed example: "Recovery is counted as successful when the relative Frobenius error of the reconstructed matrix is below 10^−3."

Variants receive short labels that are reused exactly: suffix names for model sizes (2010.11929), subset names with sample size (1603.02754), labels for run conditions (1609.02907), and quoted names for a design choice at its first use (1411.4038, 1505.04597). Once named, the label is repeated without synonyms in all 23 blocks read (impression, no counter-case noticed).

Undefined terms remain in several blocks. Abbreviations are used without a full form in the section in 9 of 23 (mAP in 1506.02640; PE, SE and DP in 1303.3997; N50 and SdBG in 1409.7208; PSNR and SfM in 2308.04079; PMS and ZAMS in 1009.1622). Some are defined earlier in the paper, which the bundle does not show.

## 6. Connectives and cohesion

Cohesion rests mainly on repetition of the same noun or name, not on connectives (impression, supported by the low connective-opener share of 0.067). In the tool papers the program name recurs as the subject sentence after sentence (1708.01492, 1303.3997, 1603.02754). In the physics papers the measured quantity recurs ("the scatter", "the fit", "the excess") (astro-ph/0006289, 1207.7235, hep-ph/0201195).

"This" plus a noun ("This result", "This finding", "This experiment") links a result to its reading in 8 of 23 blocks (2010.11929, 1603.02754, 1010.3775, 1207.7235). Bare "This + verb" openers occur 13 times in the 23 blocks (counted), most in hep-ph/0201195 (3) and 1603.02754 (2), close to the measured median share of 0.021.

Contrast is carried by "while", "whereas" and "in contrast" inside the sentence, 31 times in 13 of 23 blocks (counted; 1506.02640 has 5, 1603.02754 and 2212.04356 have 4 each). Sequence markers ("First", "Second", "Finally") organize lists of experiments in 6 blocks (counted for "Finally"). Cross-references to appendices and other sections are dense in 6 blocks (hep-ph/0201195 has 12, 2010.11929 has 6, 1706.02216 has 5) and absent in 7 (astro-ph/0006289, 1608.04644, 1506.02640, 1303.3997, 1409.7208, 1708.01492).

Constructed example of noun-repetition cohesion: "The reactor reaches steady state after 40 min. At steady state, the reactor outlet holds 2.1 mol/L of product. The outlet concentration falls by 8% when the feed temperature drops 10 K."

## 7. Differences between groups

Machine learning and computer science (16 blocks, 14 with results). Per-data-set subsections, a heavy "we" (1609.02907 and 2308.04079 above 35 per 1000 words), comparisons with named baselines, "state of the art" claims (counted 24 times in 8 blocks; 6 in 2308.04079, 5 in 2010.11929), and single values without spread. Setup detail (hardware, hyperparameters) is placed inside results (1603.02754, 1609.02907, 1706.03762, 2010.11929).

Astrophysics and physics (6 blocks, 5 with results). Longer sentences, quantities as subjects, figure-reading paragraphs that describe each curve, and uncertainty in most numbers (astro-ph/0006289, 1207.7235, hep-ph/0201195, 1609.04153). Collaboration writing is impersonal (1207.7235 has no "we"). Caveats are stated as physical reasons for a deviation (1009.1622, hep-ph/0201195).

Mathematics and statistics (4 blocks, 2 with results). The numerical-experiment sections give a numbered or bulleted protocol and then a figure reading with "we can see" (math/0409186, 1105.0828). The other two are proofs or appendices.

Quantitative biology tool papers (1303.3997, 1409.7208, 1708.01492). Very short present-tense sentences with the program as subject, speed as multiples, memory in GB, version numbers of competitors in parentheses, and frank statements of where the tool loses (1708.01492 on short-read accuracy, 1303.3997 on speed against nucmer).

## 8. Weak patterns

- "Significantly" without a test. "Significant" or "significantly" occurs 26 times in 10 of the 23 blocks (counted). In 1505.04597 (3), 1506.02640 (5) and 1608.04644 (3) it means "large", with no test behind it. In 1706.02216 and 1207.7235 it refers to a stated test. A reader cannot tell the two uses apart.
- Points without spread for small differences: gains under 1 point are reported as single values in 2010.11929, 1706.03762 and 1506.02640, with no run-to-run variation.
- Setup inside results: data sets and hyperparameters fill most of 1609.02907 and 1610.05820, so the reader reaches few numbers.
- Pointers in place of content: "results are shown/summarized in Table [REF]" with no number in the text occurs in 1609.02907 (two subsections) and 1603.02754 (5 times "The results are shown in").
- Undefined abbreviations (Section 5), 9 of 23 blocks.
- Evaluative adjectives about one's own result: "surprisingly well", "remarkably little", "excellent fit", "fascinating" (1706.03762, 1009.1622, hep-ph/0201195, 1411.1607). "Interestingly" opens a sentence 5 times in 4 blocks (0805.4471 twice, 1706.02216, 1603.02754, 2010.11929).
- Mislabelled or misplaced content under a results heading: 7 of 32 blocks (Section "Material and counting basis").
- Typographical slips and broken references in the source text (1603.02754, 1708.01492, 1506.02640), which suggests results text received less editing than abstracts (impression).

## 9. Comparison with the house rules

Rules the strong texts follow:

- Specific, quantitative wording with the comparison stated (rules in Sections 3 and 4 of `writing-style.md`): 16 of 23 put the number next to its baseline (1505.04597, 1708.01492, 1706.02216, 2212.04356).
- No closing summary and no "in summary/in conclusion" (Section 4): 0 of 32 blocks use either phrase, and none of the 13 complete blocks closes with a summary.
- Term consistency (Section 4): labels are reused unchanged in all blocks read.
- Separation of measured fact from inference (Section 2, "Honesty over completeness"): hedges sit on explanations, not on measurements, in 11 of 23 (1603.02754, 2212.04356, 1303.3997, 1010.3775).
- Operational definitions of computed quantities (Section 7): 7 of 23 define each metric by its computation (1411.4038, 1010.3775, 0805.4471).
- Low em dash use (Section 4): the measured median is 0 per 1000 words; dashes cluster in a few blocks (astro-ph/0409513 has 8, 0810.3286 has 6).
- Error-bar definitions and sample counts (Section 10): stated in the physics and statistics blocks (1207.7235, astro-ph/0006289, 1609.02907, 1010.3775).

Rules the texts break:

- Section 5, every abbreviation defined on the page: broken in 9 of 23 (1506.02640, 1303.3997, 1409.7208, 2308.04079, 1009.1622).
- Section 2, no persuasive or evaluative framing: broken by "surprisingly well", "excellent", "fascinating", and "significantly" used as an intensifier (1706.03762, hep-ph/0201195, 1411.1607, 1505.04597, 1506.02640).
- Section 2, impersonal register: the house rules do not ban "we", but the measured rate in results (19.6 per 1000 words) is the highest of any paper unit. The strong texts use "we" for actions and keep quantities as subjects for findings; a writer following the house rules can keep that split.
- Section 9, number typography: ranges and multiples are written with hyphens and "x" ("8-10%", "400-500x", "3x") in 1506.02640, 1603.02754 and 1409.7208, where the house rules ask for an en dash and ×.
- Section 4, "worth noting" and similar framing: "It is worth noting" (1708.01492), "It is important to realize" (1608.04644), and "Note that" (counted 12 times in 7 of 23 blocks; 4 in 2308.04079).
- Section 10, uncertainty with each reported value: absent in 12 of 23.
- Section 6, no prompt or status framing inside a document: 1603.04467 holds only a promise of a later version, and 1609.04153 states the date of the estimates and a package location inside the section.

Prose over bullets (Section 6): the house preference for prose over bullets is mostly followed (bulleted protocols or data-set lists appear in 4 of 23: math/0409186, 1105.0828, 1411.4038, 1506.02640, each for genuinely parallel items).
