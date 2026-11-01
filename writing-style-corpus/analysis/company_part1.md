# Company tutorials and technical blog posts, part 1

## Scope and method

The bundle `company_post_part1.txt` holds 22 documents, all read in full: 14 blog posts (anthropic-01, -09, -11; deepmind-02, -04, -06, -08, -11; google-03, -05, -07; openai-08, -10, -12) and 8 tutorials or documentation guides (anthropic-02, -05, -07; google-08, -10, -12; openai-02, -04). Six documents are cut at about 3000 words and stored as one line with paragraph breaks removed (anthropic-01, -02, -09, -11; google-08; openai-04). Paragraph counts therefore use the other 16, and counts of closing moves use the 16 that are complete.

Three kinds of evidence are kept apart below. Measured: the genre-level medians in `metrics_summary.csv` (genre "company", unit "post", n = 48; these cover both halves of the corpus, so they are not specific to this bundle). Counted: tallies made for this report, by reading or by simple regular expressions over this bundle; regex counts are rough. Impression: judgements not reduced to a count, marked as such.

Within the 14 blogs there are two sub-kinds that behave differently: research blogs that announce a paper (deepmind-02, -04, -06, -08, -11; google-03, -05, -07; 8 documents) and engineering or product blogs that pass on practice (anthropic-01, -09, -11; openai-08, -10, -12; 6 documents). Several patterns split along this line more sharply than along "tutorial versus blog".

## 1. Structure

Research blogs (8). The usual sequence is: one-sentence summary under the title, broad context, gap or question, the paper and its venue, mechanism explained through a small example, results, forward-looking close, credits.

- Summary sentence or subtitle under the title, before the body: 6 of 8 (google-03, -05, -07; deepmind-02, -06, -11).
- Context followed by an explicit gap or question: 6 of 8 (deepmind-04, -06, -08; google-03, -05, -07). The other two open with an announcement of a deployed system (deepmind-02, -11).
- Paper named, usually with venue: 7 of 8 (google-03 COLM, google-05 ICLR, deepmind-08 Nature Neuroscience, deepmind-11 Nature; deepmind-02, -04, -06 by link or note).
- A hypothesis is stated, a test is described, and the result follows ("To test this, we..."): 4 of 8 (google-03, -05; deepmind-04, -08).
- Close on implication or future work ("we believe", "we look forward", "going forward"): 8 of 8. Credits or acknowledgements: 8 of 8.

Constructed example of the opening moves: "Packed-bed reactors are designed with steady-state models. These models cannot say when a hot spot will form. In our new paper, we show that a single dimensionless group predicts it."

Engineering blogs (6). Five of six (anthropic-01, -09, -11; openai-08, -10) follow a lessons-learned plan: the change in practice, a definition or mental model, then a series of principles, each a short heading or bold imperative followed by mechanism and evidence, then a recap. openai-12 is a set of five customer case studies with the same internal template each time (title, author line, tools and models line, quote, numbered subsystems).

Tutorials (8). The usual sequence is: scope statement, terms, concept or flow, procedure or rules, configuration details, limits or troubleshooting, links onward.

- Explicit scope statement at the start ("This guide covers", "In this module, you learn", "This page explains"): 7 of 8 (anthropic-02, -05; google-08, -10, -12; openai-02, -04). anthropic-07 implies its scope through a "useful when" list.
- A map of the page's own parts: 3 of 8 (anthropic-02, google-08, openai-02).
- A terms section or definition list before any procedure: 4 of 8 (google-08, -10; openai-04; anthropic-05 through its "contract" section). anthropic-11, a blog, does the same with eight defined terms.
- End on onward links ("Next steps", "Resources", "Other resources"): 5 of 5 complete tutorials (anthropic-05, -07; google-10, -12; openai-02). google-10 and -12 add self-check questions.

Length (counted, rough). Complete research blogs run 900–1600 words (median about 1400) and 36–77 sentences. Complete tutorials and engineering blogs run 1000–2900 words. Measured paragraph length for company posts is 38 words (IQR 27–52), which is two to three sentences; in the 16 documents with breaks kept, one-sentence paragraphs occur in all 8 research blogs, usually as a result line or a transition.

## 2. Paragraphs

Opening. In research blogs the first sentence of a paragraph is a claim or a step in the story, with the system name as subject (impression, supported by counts in item 3). In tutorials it is either a definition ("X is a ...") or a condition ("When you ..., ...").

Development. Three patterns recur.

- Claim, mechanism, consequence: the paragraph states what happens, says why, and ends with what it means. Closing sentences that start with "This" or "These" plus a noun or verb ("This means", "This shows", "This approach"): counted in 17 of 22 documents, most often in anthropic-09 (15), anthropic-01 (14), deepmind-02 (10) and google-08 (9). Measured rate of bare "This/These + verb" openers for the genre: 2.7 % of sentences.
- Setup of a small scenario, step by step, then the general lesson: deepmind-04, -06, -08; google-03, -05 (5 of 8 research blogs).
- Recommendation, reason, internal or customer anecdote with a number: google-08 (stale table, 2 % lift), anthropic-09 (tool rewriting, 40 % less time), openai-08 (Glean, 20 % drop then recovery), openai-02 (customer quotes with accuracy figures). 4 of 22 build most paragraphs this way; another 2 do it occasionally (anthropic-11, openai-12).

Constructed example of the claim, mechanism, consequence pattern: "Fouling raises the thermal resistance of the tube wall. The outlet temperature falls even when the flow is constant. This means that a drifting outlet temperature is an early sign of fouling."

Hand-over. Sections are linked by a question at the end that the next section answers in 5 documents (google-03, google-05, deepmind-06, anthropic-01, anthropic-11), and by a signpost sentence ("The following three examples show", "Let's see how", "Now let's look at") in 6 (deepmind-04, google-10, google-12, anthropic-01, openai-04, openai-08). Questions used as headings: deepmind-04 (all three environment headings), anthropic-11.

## 3. Sentences

Length and rhythm. Measured: mean 21.2 words per sentence (IQR 19.4–24.8), coefficient of variation 0.51, 5.6 % of sentences over 40 words. Counted per document (rough), research blogs are longer: median sentence length 24–27 words in deepmind-06, -08, google-05, -07, with 12–18 % of sentences over 40 words in google-05, google-07 and deepmind-08. Tutorials are shorter: google-10 has a median of 13 words, and google-08, google-10 and anthropic-07 have about 24 % of sentences at 10 words or fewer. Short sentences are placed after a long explanation as a verdict, in 9 documents by reading (anthropic-01, -09; google-08, -10; openai-08, -10; deepmind-04; google-03, -12).

Constructed example: "A larger tube count lowers the pressure drop and raises the shell-side velocity, which improves the film coefficient up to the point where vibration limits the design. Past that point, the gain is lost."

Information flow. The subject slot usually holds the known item, most often the named system or "the model"; new information (a number, a mechanism) sits in the final stress position. Paragraphs in which three or more consecutive sentences open with the same system name: deepmind-02, deepmind-11, openai-12, openai-02 (4 documents). Results go at the end of the sentence, after "by" or "to": deepmind-02, anthropic-09, openai-08, openai-12, google-07 (5).

Openers. Measured: 6.6 % of sentences open with a connective from the list in `metrics.py`, which is low. Counted openers that recur: conditional "If/When you ..." clauses in all 8 tutorials; imperative openers ("Use", "Keep", "Add", "Avoid") in anthropic-02 (11), google-12 (11), google-08 (10), openai-04 (9).

Person. Measured medians: 9.2 "we/our/us" and 4.7 "you/your" per 1000 words, with very wide IQRs (2.7–20.4 and 0–24.3) because the two sub-genres differ. Counted (rough): research blogs use "we" at 9–28 per 1000 words and "you" at 0–2 per 1000 (8 of 8); tutorials use "you" at 11–44 per 1000 and "we" at 0–17 (google-08 44, google-12 33, google-10 31, anthropic-02 28, anthropic-05 28). Engineering blogs mix both: anthropic-09 has 23 "we" and 2 "you"; openai-08 and openai-10 have 22–28 "you".

Voice. Measured passive share is 13.7 % of sentences. By reading, the passive sits in two places: in tutorials it describes what the system does without the reader ("each request is processed independently", "definitions are billed as input tokens"; anthropic-07, openai-04, anthropic-05), and in research blogs it describes experimental set-up ("the network was trained", "the objects were shown"; deepmind-08, google-05). Decisions and claims are active with "we" (all 8 research blogs).

## 4. Claims and evidence

Numbers. Quantitative results stated in the running text: 9 of 22 (deepmind-02, anthropic-09, anthropic-11, google-07, google-08, openai-02, openai-08, openai-12, anthropic-07). The strongest give a baseline and the size of the change: "from X to Y", "by N % relative to Z" (deepmind-02, anthropic-09, openai-02, openai-08). Uncertainty (error bars, confidence intervals, number of runs) is reported in 0 of 22. google-07 gives accuracy figures for its method without the baseline figures. Six of 8 research blogs state their main result only qualitatively in the text and leave any numbers to figures (google-03, google-05, deepmind-04, deepmind-06, deepmind-08, deepmind-11).

Constructed example of the strong form: "The new correlation cut the error in predicted outlet temperature from 8 K to 2 K on the 40 test cases."

Strength. Intensifiers ("remarkably", "incredibly", "surprisingly", "significantly", "substantially", "powerful", "critical"), counted by regex: 11 in deepmind-02, 7 in anthropic-09, 6 in deepmind-11, 5 each in openai-02 and openai-12; 0 in deepmind-04, -06, -08, google-07, anthropic-02, anthropic-05, openai-10. Results paragraphs in deepmind-02 contain no hedge at all (1 hedge in the whole post).

Hedges. Measured: 5.1 hedge words per 1000 words. By reading, hedges cluster in two places: in closing paragraphs about future impact (google-03, google-05, deepmind-02, deepmind-06, anthropic-01; 5 documents), and in tutorials as descriptions of variable model behaviour ("might skip", "may go slightly over"; anthropic-02, anthropic-07, openai-04, google-10). Method and set-up sentences carry none.

## 5. Terms and definitions

A new term is named with a marker phrase ("called", "known as", "we refer to this as", "which we call", "a.k.a."), counted in 14 of 22 documents; most in google-05 (5), openai-04 (5), deepmind-08 (3), google-03 (3), anthropic-11 (3). The research blogs often give the plain description first and the name last, so the name lands in the stress position (google-03, google-05, deepmind-06, deepmind-08). Tutorials give the name first in a definition list (google-08, openai-04, anthropic-11, google-10).

Constructed example of name-last: "The wall temperature rises and falls with the flow, a lag that we call thermal inertia of the tube."

Aliases are listed once and one term is then kept: anthropic-11 (transcript, also trace or trajectory), openai-04 (function call or tool call), google-08 (feature column, also namespace or field). anthropic-11 then keeps "transcript"; openai-04 alternates "function" and "tool" through the guide. Analogy as definition: google-05 (gas particles and a force field), google-07 (sleep phases), deepmind-11 (layout as a game), google-03 (spreading activation), anthropic-01 (working memory); 5 documents.

Abbreviations are expanded at first use in most documents. Exceptions found: deepmind-04 (A2C, DQN never expanded), google-08 (VW), anthropic-11 (SME), google-07 ("Hope", "Titans" as unexplained names). Repeated expansion of one abbreviation within a post: google-07 (MoE, ICL, LLM), google-12 (PII), deepmind-11 (EDA).

## 6. Connectives and cohesion

Cohesion rests mostly on repeating the head noun and on "this/these + noun" (item 2), not on logical connectives. Measured: 6.6 % connective openers. Counted: "However" appears 0–2 times per document (22 of 22 at or under 2). "For example/For instance" is the most frequent link in tutorials: google-08 (12), google-12 (12), google-10 (7), anthropic-09 (8), anthropic-11 (7). Causal links ("because", "since", "so that") appear 0–6 times per document; research blogs google-07, deepmind-02 and deepmind-11 have none. Colons carry definitions and lists in 7 of 8 tutorials. Em dashes: measured median 0.32 per 1000 words; counted 0 in 10 of 22 documents, and above 4 per 1000 in openai-02, deepmind-08 and anthropic-11.

## 7. Teaching method

Order of concepts. In 6 of 8 tutorials concept comes before procedure: what a thing is, where it runs or how it flows, then how to call it (anthropic-05, -07; google-10, -12; openai-02, -04). google-08 is a rule list, but each rule is placed in project order (before ML, first pipeline, iteration, plateau). Research blogs explain the simplest case first and then generalise: google-05 (one dimension with two points, then high-dimensional manifolds), deepmind-06 (Prisoner's Dilemma, then the gathering game), google-03 (one question, then the two mechanisms).

Worked examples. A running example carried through several sections: google-10 (one writing assistant), openai-04 (one weather tool through every step of the flow), google-05 (the two-point case), anthropic-11 (a booking agent and a refund task); 4 documents. Arithmetic worked in the text: anthropic-11 (probability that all three trials pass, computed from the per-trial rate); 1 document.

Contrast pairs. "Less effective / more effective", "bad / good", "instead of / try": anthropic-02, openai-10, openai-04, openai-08, google-12 (5). The pair is short and differs in one element.

Constructed example: "Less effective: 'Check the heat balance.' More effective: 'Compare the duty from the hot side with the duty from the cold side and report the difference in kW.'"

Justification. Each recommendation is justified in one of three ways: (a) by mechanism, in a "because" clause or the next sentence (anthropic-05, anthropic-07, openai-10, google-10, anthropic-01); (b) by an internal or customer case with a number (google-08, anthropic-09, openai-08, openai-02, openai-12, anthropic-11); (c) by authority alone ("we recommend"; anthropic-07, openai-04). A test the reader can run on a draft ("if a colleague could not follow it", "if an intern could not use the function", "if you cannot explain the data flow to a non-specialist") appears in 5 documents (anthropic-01, -02, -05; openai-04; google-12).

Address. Tutorials address the reader directly in second person and the imperative (8 of 8), with conditional set-up ("If you need X, use Y"). Research blogs address the reader only to invite ("imagine", "consider"; google-05, deepmind-06, google-03) and otherwise narrate with "we". Questions put to the reader: google-08 (5 and a string of them in Rule 8), anthropic-09 (9), anthropic-02 (8).

## 8. Differences between groups

- DeepMind (5 blogs): highest "we" rate, no "you" in 4 of 5, announcement and impact framing, the most intensifiers (deepmind-02, -11) and quoted third-party praise (deepmind-11); the older posts (deepmind-04, -06, -08) are plainer and teach through one experiment.
- Google Research blogs (3): fixed template (date, author line, one-sentence summary, quick links, labels), mechanism-centred section headings, results in figures, captions under each figure.
- Google tutorials (3): the highest "you" rates (31–44 per 1000), numbered rules or modules, per-section recap lists and quizzes (google-10, -12).
- Anthropic (6): long engineering explanations with mechanism plus own-system evidence; reference pages (anthropic-02, -07) are lists of model-specific caveats with few causal links.
- OpenAI (5): numbered tips, customer quotes as evidence (openai-02, -12), slogans and fragments in closings (openai-12), contrast pairs (openai-10, -08).

## 9. Weak patterns

- Intensifiers in place of numbers: deepmind-02 (11), anthropic-09 (7), deepmind-11 (6). Constructed example of the fault: "The new solver is remarkably fast."
- Results without baseline or uncertainty: google-07 (no baseline values), and 0 of 22 report uncertainty.
- Trailing participle clauses that add vague benefit, counted by regex: deepmind-02 (5), openai-02 (5), anthropic-01, anthropic-09, deepmind-11, google-07 (4 each).
- Stock negative parallelism ("not just X but Y", "rather than"), counted: anthropic-09 (5), anthropic-02, google-05 (4 each).
- Repeated expansion of the same abbreviation and alternating terms: google-07, google-12, openai-04, anthropic-01 (sub-agent and subagent).
- Duplicated text: openai-04 repeats a sentence for its two APIs; deepmind-11 repeats a quote; google-12 ends with two "Resources" headings.
- Customer quotes that carry superlatives as evidence: openai-02 (7 quotes), deepmind-11 (4 quotes).
- Recap blocks that restate the section: google-12 (3), google-10, openai-08.

## 10. Comparison with the house rules

Rules the strong texts follow:
- Brief, plain wording and short verdict sentences (Section 3): google-08, anthropic-05, openai-10.
- Every computed quantity defined by its procedure (Section 7): anthropic-11 (pass@k and pass^k defined, with a computed case), google-03 (pass@k defined before use).
- Abbreviations expanded at first use (Section 5): google-03, anthropic-09, openai-08.
- Simple case before the general one, each step with its physical meaning (Section 7): google-05, deepmind-06, deepmind-08.
- Quantitative claims with a baseline (Section 3): deepmind-02, anthropic-09, openai-08.
- Low em-dash use (Section 4): 10 of 22 have none, among them google-03, google-05, google-08, google-12.
- Captions that state a takeaway (Section 10): google-05 (most captions are one-sentence findings).

Rules the texts break:
- Second person (Section 2 bars second-person asides in documents): all 8 tutorials and openai-08, -10. In tutorials, second person is the main mode of address, not an aside, so this rule does not transfer to the tutorial genre.
- Nominal headings (Section 2): headings that are questions, imperatives or "How ..." clauses in 11 of 22 (anthropic-01, -02, -05, -07, -11; deepmind-04, -11; google-08; openai-02, -04, -08).
- Origin statements (Section 6): "Today we are announcing", "This post", credits and acknowledgements in 13 of 22 (all 8 research blogs; anthropic-01, -09, -11; openai-08, -12).
- Overused word set (Section 4): 8 hits in deepmind-11, 7 in anthropic-01, 6 in google-07, 5 each in deepmind-02, anthropic-09, openai-02.
- Summaries of what a section said ("In summary", "To recap", "Your takeaways"): deepmind-06, openai-08, google-10, google-12.
- Citations for modelling choices (Section 8): author–year citations in text in 1 of 22 (google-05); the others rely on links that the bundle shows only as removed anchors, so this could not be checked further.
- Uncertainty on numbers: 0 of 22, against the rule that numbers be stated with the evidence they need.
