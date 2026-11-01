# Company tutorials and technical blog posts: style analysis, part 2

## Scope and method

The bundle `company_post_part2.txt` holds 22 documents: 14 blog posts (anthropic-08, -10, -12; deepmind-01, -03, -05, -07, -09, -12; google-04, -06; openai-07, -09, -11) and 8 tutorials or documentation guides (anthropic-04, -06; google-01, -09, -11; openai-01, -03, -06). All 22 were read in full. Two documents are cut short with `[...]` and have no paragraph breaks in the bundle (anthropic-08, google-09), so they count for sentence and structure patterns but not for paragraph counts.

Three kinds of evidence are kept apart below:

- **Counted in the bundle**: tallies made while reading, plus regular-expression counts per document (second-person and first-person pronouns per 1000 words, headings, sentence-initial "However", imperative sentence openers, "we found"-type phrases).
- **Measured**: the genre-level medians in `metrics_summary.csv`, row `company,post` (n = 48 posts, both halves of the corpus). These are given as median [interquartile range].
- **Impression**: marked as such.

Code listings, tables and figures were stripped during extraction. A sentence that announces an example and is followed by nothing ("Here is a sample prompt:") comes from that stripping, not from the authors.

## 1. Structure of a whole post or guide

### Blog posts (14)

The usual sequence has five moves: stake or problem, contribution, mechanism, evidence, outlook.

1. **Stake or problem first.** 13 of 14 posts open with a problem or with a scene at human scale before naming the contribution. Examples are a commuter's delayed train (deepmind-07), weather that affects daily life (deepmind-09), metaphors of memory (deepmind-05), a question about why models get facts wrong (google-04), and an engineer starting a shift with no handover notes (anthropic-10). The exception is anthropic-12, which opens on an update notice and then the contribution.
2. **Contribution in the first three paragraphs.** 14 of 14 do this with a framing sentence: "In this post, we...", "This post explains...", "In a paper published in X, we introduce...". 7 of 14 name the venue or the paper in that sentence (deepmind-01, -05, -07, -09, -12; google-04, -06).
3. **Mechanism.** Headed sections explain how the method or practice works.
4. **Evidence.** Numbers mostly arrive in a results section in the second half of the post. Only 2 of 14 put a headline comparison in the first three paragraphs: deepmind-01 (problems solved against the previous system and against the human gold-medal average) and deepmind-09 (in the subtitle).
5. **Outlook or recap.** 10 of 14 end on an outlook or a hope (anthropic-08, -10, -12; deepmind-01, -03, -05, -07, -09, -12; openai-11). The other 4 end on a recap or recommendation (google-04, google-06, openai-07, openai-09).

All six DeepMind posts and both Google Research posts carry an author byline. 7 of 14 blog posts end with acknowledgements or author notes (anthropic-10; deepmind-01, -03, -05, -07, -09, -12).

### Tutorials (8)

The usual sequence is: what the feature or concept is, prerequisites or the decision to use it, task-ordered sections, limitations, then next steps.

- 5 of 8 open with a one-sentence definition of the feature or concept (google-01, google-11, openai-01, openai-03, openai-06).
- 2 of 8 open with a prerequisites list (anthropic-04, -06).
- 7 of 8 end with "Next steps", "Resources" or onward links (anthropic-04, -06; google-01, -11; openai-01, -03, -06). google-09 is truncated before its end.
- 2 of 8 end with a comprehension quiz (google-01, google-11), and google-01 also opens with a bullet summary of the main points.

Two blog-labelled documents follow the tutorial plan, with imperative numbered steps (openai-07) and a recipe sequence of prototype, evaluate, refine (anthropic-08).

### Headings

- **Question headings** appear in 5 of 22 documents (anthropic-08, anthropic-12, google-01, google-04, openai-09).
- **Imperative task headings** make up most headings in 4 documents (anthropic-06, google-09, google-11, openai-07).
- **Numbered headings** appear in 3 documents (anthropic-12, openai-07, openai-11).
- **Nominal headings** are the DeepMind default, for example a dataset name or "the challenge of X".
- **Sentence case** is used in most documents. Title case appears in anthropic-12, deepmind-12 and google-09.

### Length

- Measured: median 1660 words [1260, 2510] and 82 sentences [54, 131] per post.
- Counted in this bundle: 843 words (deepmind-03) to 3063 words (anthropic-08).
- Heading counts: DeepMind posts have 1–5 headings, while tutorials have 7–37 (openai-03 has 37).
- Measured paragraph length: median 38.2 words [27.3, 51.7]. That is two to three sentences.

## 2. Paragraphs

**Opening.** A paragraph usually opens with a claim sentence whose subject is the method, the system or the reader's task. The sentence after it gives the reason or the mechanism.

- Counted over paragraphs of at least 12 words: an opener of the form "In/For/When/If/As/Before/With ..." (a frame or condition) is the most common marked opener in tutorials. Examples are openai-03 with 22 of 63 paragraphs and openai-06 with 14 of 31.
- "We"-openers cluster in research blogs: google-04 has 9 of 24 and deepmind-03 has 6 of 16.

> Constructed example: "When the inlet temperature rises, the reactor runs closer to its limit. The heat of reaction now leaves through a smaller temperature difference, so the jacket needs more coolant."

**Development.** The paragraph develops by example (a concrete case right after the claim) or by contrast (the old way, then the new way). It rarely builds a chain of more than three reasoning steps.

- Impression: development by example is most common in tutorials and development by contrast in blog posts.
- deepmind-05 and deepmind-07 are the exceptions. Each builds a step-by-step explanation across several paragraphs: computer memory to data structures to the controller in deepmind-05, and an average prediction to a distribution of predictions in deepmind-07.

**Closing.** Paragraphs close in one of three ways:

- a consequence for the reader ("so you can...");
- a short evaluative sentence;
- a forward pointer to the next section.

Forward pointers are counted in 5 documents: anthropic-08, anthropic-12, openai-01, openai-11 and google-09 each have at least one sentence that announces the next section.

**Handover between paragraphs.** The next paragraph usually repeats the key noun of the previous paragraph's last sentence, or opens with "This/These + noun".

- openai-07 opens 11 of 44 paragraphs with This/These.
- anthropic-06 has 13 such openers of 60, but most of them follow a metric name that was stripped during extraction, so its count overstates the habit.

## 3. Sentences

**Length and rhythm (measured, company posts).** The median mean sentence length is 21.2 words [19.4, 24.8], with a standard deviation of 10.8 words. The coefficient of variation is 0.51, meaning sentence length varies by about half its mean. Sentences over 40 words make up 5.6% [2.8, 7.5].

The counted contrast within this half is clear:

- openai-09 is the most clipped text. It has 12 sentences of fewer than 8 words among 124, and few long ones.
- The DeepMind posts sit at an even mid-length with few very short sentences: deepmind-01, -03, -05 and -09 each have zero to two sentences under 8 words.
- The usual rhythm pairs one long explanatory sentence with a short verdict sentence. Counted: this pairing appears at least twice in google-04, google-11, openai-07 and anthropic-10.

> Constructed example: "Quicksort splits the array around a pivot and sorts each part in turn, so a typical run makes about n log n comparisons. A sorted input breaks this."

**Information flow.**

- In blog posts, the system name is the grammatical subject of sentence after sentence. GraphCast, AlphaGeometry, DNCs and Retrieve-for-Train each recur as subject in deepmind-09, deepmind-01, deepmind-05 and google-06.
- In tutorials, the subject is either "you" or the API object (a parameter, a field, a mode).
- The stress position at the end of the sentence carries the new value: a number, a constraint, or the consequence.
- Conditions come first ("If the call times out, ..."). Counted: a sentence-initial "If/When/Before/Once ..., [imperative]" frame appears in 10 documents, most often in google-09 and openai-09 (4 each) and openai-03 (3).

**"We".** Measured: 9.15 [2.71, 20.4] per 1000 words. Counted ranges:

- DeepMind: 14–39 per 1000 words. deepmind-07 is highest at 38.7.
- Google Research blogs: 9–23.
- Tutorials: 0–5, and 0 in anthropic-04, anthropic-06 and google-01.

"We" marks decisions and findings ("we chose", "we found"). It does not appear in the definitions.

**Passive voice.** Measured: 13.7% [9.2, 19.2] of sentences. In this bundle the passive is used for:

- evaluation procedure (deepmind-01, deepmind-03, google-04: responses were graded, solutions were checked);
- API behaviour stated as fact (anthropic-04, openai-03: a field is specified in a given parameter).

Actions by the team are active.

**Imperatives.** Sentence-initial imperatives are counted at 21 in openai-09, 16 in anthropic-08, 12 in anthropic-06 and 9 in openai-07. They are 0 in five of the six DeepMind posts; deepmind-07 and deepmind-12 have one each, inside quoted or example material.

## 4. Claims and evidence

**Comparisons with a baseline.** 8 of 22 documents give a numeric result against a named baseline:

- anthropic-12: a score with the tool against the baseline;
- deepmind-01: problems solved against the previous system and humans;
- deepmind-09: share of test variables better than the operational system;
- deepmind-07: performance reached in a fraction of the training time;
- google-04: with and without thinking;
- anthropic-06: accuracy before and after retrieval of examples;
- google-06: speed-up against autoregressive generation;
- anthropic-08: token counts of a detailed and a concise response.

**Uncertainty.** Only 1 of 22 (anthropic-12) reports statistical uncertainty, with sample sizes, a test statistic and an effect size. google-04 gives results as ranges across models (for example, encoding of 95–98% of facts). No document shows error bars in text.

**Claim strength.**

- Headline results are stated without hedges in deepmind-01, deepmind-09, google-06 and anthropic-12.
- Superlatives are used: "most accurate ... in the world" (deepmind-09), "breakthrough" (deepmind-01).
- Measured hedge rate: 5.14 [2.68, 7.61] per 1000 words. Counted hedge words (may, might, could, likely, potentially, perhaps, suggest) are highest in google-01 (11.0), deepmind-05 (8.5), anthropic-08 (8.2) and anthropic-06 (7.1).

Hedges sit in three places:

- **Conditional advice** to the reader ("you might want to...") in anthropic-04, anthropic-06, openai-01 and openai-03.
- **Interpretation of results** ("our results suggest") in google-04 (three times), deepmind-12 and anthropic-08.
- **Outlook paragraphs** in anthropic-10, deepmind-01, deepmind-07 and openai-11.

> Constructed example: "The new fin layout cut the wall temperature by 12 K against the plain tube at the same flow rate. Our tests suggest the gain comes from the thinner boundary layer, not from the larger area."

**Unsourced quantitative claims.** These appear in 2 documents: anthropic-06 gives industry benchmark ranges with no source, and google-09 gives typical page-load figures as an illustration only.

## 5. Terms and definitions

New terms are introduced in four ways:

1. **"We call this X" or "which we call X"**, after the mechanism has been described: 5 documents (deepmind-01, deepmind-05, deepmind-07, openai-11, google-04). The name comes after the idea, never before it.
2. **"X is called Y" or "X means Y"** in a definitional sentence: google-01, openai-01, openai-09, google-09.
3. **Parenthetical gloss** right after the term ("Evals (short for evaluations)", or namespacing glossed in brackets): at least one each in anthropic-08, openai-07, google-06 and deepmind-05.
4. **A labelled list** of terms with one-sentence definitions: anthropic-10, google-04, google-06, deepmind-12.

Once introduced, a term is repeated exactly. Counted: in deepmind-05, google-04 and openai-03 the defined term recurs unchanged in every later mention, with no synonym cycling. Abbreviations are usually expanded once and then used bare (CoT in anthropic-08, DNC in deepmind-05, HRES in deepmind-09, LOV and CSP in openai-11, GRPO in google-06).

## 6. Connectives and cohesion

Cohesion rests mostly on repeated nouns and on "This/These + noun". Explicit connectives are sparse.

- Measured: 6.55% [3.26, 8.90] of sentences open with a connective. 2.68% [1.47, 3.96] open with a bare "This/These + verb".
- Counted: a sentence-initial "However" appears in 10 documents and is absent from 12 (anthropic-04, -06; deepmind-01, -03, -05, -07, -09; google-04; openai-06, -07, -09, -11).
- Ordinals ("First, ... Second, ...") structure lists of failure modes or phases in anthropic-10 and deepmind-03.
- "For example" or "for instance" is the most frequent connective: 12 in google-09, 9 in anthropic-08, 7 each in anthropic-06 and google-01. It is absent from 5 documents (anthropic-12; deepmind-01, -03, -09, -12).
- Semicolons are rare. Measured: 0.562 per 1000 words [0, 1.3].

## 7. Teaching method

**Order of concepts.** 15 of 22 documents teach a new idea by setting it against a known neighbour before giving its mechanism:

- functions and tools (anthropic-08);
- extended thinking and a think tool (anthropic-12);
- classical machine learning and the model (anthropic-06);
- N-grams, then recurrent networks, then large models (google-01);
- test-driven development and evaluation-driven development (google-11);
- JSON mode and Structured Outputs (openai-03);
- reasoning and GPT models (openai-01);
- web apps and ChatGPT apps (openai-11);
- neural and symbolic parts (deepmind-01);
- RAM and the differentiable neural computer, or DNC (deepmind-05);
- averages and distributions (deepmind-07);
- encoding and recall (google-04);
- inference-time reasoning and offline training (google-06);
- direct and cloud routes (openai-09);
- impressions and evals (openai-07).

**Everyday analogy.** 11 of 22 use an analogy before the technical account: anthropic-08, anthropic-10, deepmind-01, deepmind-05, deepmind-07, google-01, google-04, google-06, google-11, openai-01, openai-11.

**Running example.** 9 of 22 carry one example through three or more sections: anthropic-06, anthropic-10, deepmind-05, deepmind-07, deepmind-12, google-01, google-06, openai-07, openai-09. Among these, deepmind-07 is the only worked numerical example, with the arithmetic carried through each station.

> Constructed example: "Take a pipe that loses 4 kW at the design flow. Doubling the insulation thickness halves the conductance of the insulation layer, so the loss drops to about 2.3 kW once the outer film resistance is included."

**Good and weak examples side by side.** 5 documents show both (anthropic-04, anthropic-08, google-06, google-09, openai-07). The contrast teaches the criterion without stating it as a rule.

**How a step is justified.** There are four sources of justification:

- **Mechanism**, through "because" clauses: anthropic-08, anthropic-10, deepmind-01, deepmind-07, google-04, google-09.
- **The team's own experience**, through "we found", "we observed", "after some experimentation": 6 documents (anthropic-08, -10, -12; google-06; openai-01, -11).
- **A measured result**: 3 documents (anthropic-06, anthropic-08, anthropic-12).
- **Explicit "when to use / when not to use" scope**: 4 documents (anthropic-06, anthropic-12, openai-03, openai-09).

Recommendations are often stated bare in reference-style tutorials. openai-03 has 20 uses of "must" for API constraints, given without reasons.

**How the reader is addressed.** Measured: "you" at 4.65 [0, 24.3] per 1000 words. Counted per document:

- Tutorial-style texts address the reader directly: google-11 (48.7), google-09 (45.2), openai-03 (36.5), anthropic-08 (28.4), openai-07 (24.3).
- Five of the six DeepMind posts never use "you" (the sixth, deepmind-05, uses it only inside quoted example questions). Those posts address the reader through a hypothetical scene ("consider the commuter") instead.
- google-09 is the only document in first person singular.

## 8. Differences between groups

- **DeepMind blog (6).**
  - Bylined.
  - Each opens with a paper announcement plus a scene or metaphor (4 of 6 use a scene: deepmind-05, -07, -09, -12).
  - 1–5 headings, and no bullets in 4 of 6.
  - The highest "we" rates (14–39 per 1000 words) and no imperatives.
  - Each closes on hope or a wider goal.
- **Google Research blog (2).**
  - A question in the title or opening (google-04).
  - A named framework, followed by a labelled list of definitions.
  - Figure captions that describe panels as left, right and top.
  - google-06 has the densest jargon and the most promotional verbs in the bundle.
- **Google tutorials (3).**
  - A summary at the top and a quiz at the end (google-01, google-11).
  - google-09 is a personal essay-guide with imperative headings.
- **Anthropic (5).**
  - Practice reports grounded in internal experiments ("we found", "we recommend": 7 recommendations in anthropic-08).
  - The model or product is the recurring subject.
- **OpenAI (6).**
  - Reference-style tutorials with many constraint headings (37 in openai-03).
  - Policy-style blogs in short imperative sentences (openai-09).
  - A guest post organised as 15 numbered lessons (openai-11).

## 9. Weak patterns to avoid copying

- **Repetition of a sentence or claim.** A closing sentence is repeated almost word for word in openai-07, and an evaluative sentence appears twice there. google-04 states the shift from knowledge acquisition to knowledge use twice in two sections.
- **Promotional verbs and intensifiers** in results text: google-06 (bottleneck "smashed", "massive" speed-up), anthropic-12 ("dramatic", "remarkable"), deepmind-09 ("unprecedented").
- **Negative parallelism** ("not X, but Y"; "isn't about X, but about Y"): at least once each in anthropic-12, deepmind-09, google-04, openai-07, openai-11.
- **Trailing participle clauses** that add vague benefit: deepmind-01, anthropic-06, anthropic-08, google-06.
- **Undefined abbreviations**: SLA and CSAT (anthropic-06); TTL (openai-06, openai-11); XHR and HMR (openai-11); TPU (deepmind-09); the Vendi Score as a term (google-06).
- **Unit and symbol slips**: "28km x 28km" with no space and a letter x (deepmind-09); a speed-up range with its multiplication sign missing (google-06); a hyphen in a numeric range (deepmind-09).
- **Grammatical slips**:
  - "fail recognize" (anthropic-10);
  - "i,e." (google-06);
  - "Here are some key components to consider include" (google-11);
  - an "either" with no second option (openai-06).
- **Claims without sources**: benchmark ranges in anthropic-06.

## 10. Comparison with the house rules (`writing-style.md`)

### Rules the strong texts follow

- **Sentence case headings** (Section 6): most documents, for example deepmind-03, google-04, openai-09.
- **Abbreviation expanded at first use** (Section 5): deepmind-05, deepmind-09, anthropic-08, openai-11.
- **Repeat the term, no synonym cycling** (Section 4): deepmind-05, google-04, openai-03.
- **Quantitative wording with a baseline** (Section 3): deepmind-01, deepmind-09, anthropic-12, google-04.
- **Prose by default, bullets for parallel items** (Section 6): all six DeepMind posts, with no bullets in 4.
- **En-dash ranges and stated scope**: google-04 and anthropic-06. openai-09 states what is out of its scope.

### Rules they break

- **No second-person asides** (Section 2). Broken by every tutorial and by anthropic-08 and openai-07: 11 of 22 documents exceed 5 uses of "you" per 1000 words. In this genre second person is the main teaching device, not an aside.
- **No document origin** (Section 6). Broken by bylines and acknowledgements in 7 posts, and by origin statements such as a customer partnership (openai-09) or a company belief (openai-11).
- **Citations for every modelling choice, with a bibliography** (Section 8). Broken by 21 of 22. Only deepmind-12 has a reference list (four entries, with numbered in-text markers). The others link "our paper" with no bibliographic data.
- **No hype** (Sections 2 and 4). Broken by deepmind-01, deepmind-09, google-06, anthropic-12.
- **Negative parallelism and participle tails** (Section 4). See Section 9 of this report.
- **Low em-dash use** (Section 4). Measured median 0.321 per 1000 words [0, 1.97], so mostly low, but high in anthropic-12 (5.2), anthropic-08 (3.9) and openai-03 (3.6).
- **Typography of numbers** (Section 9). deepmind-07 shows its arithmetic inline with a letter x as the multiplication sign. deepmind-09 and google-06 also break the rule.
- **Figure captions in the "Fig. N |" form** (Section 10). Broken by all documents that keep captions. openai-09 uses "Figure 1." and google-04 describes panels without a takeaway sentence.

### What the house rules lack

The house rules have no counterpart to three devices that carry the teaching in the strongest texts (deepmind-05, deepmind-07, google-01, openai-07):

- the running example;
- the known-neighbour contrast placed before the mechanism;
- the good and weak examples shown side by side.
