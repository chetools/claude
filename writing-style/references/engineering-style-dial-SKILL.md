

# Engineering Style Dial

## Purpose
Let the user set, per request, how strictly a piece of writing follows ASD-STE100 Simplified Technical English. 100% is the full standard; 0% is Muse's normal writing voice; values in between blend the two.

## Workflow
1. Get the percentage `p` (0–100) only from phrases that attach it to the style itself: "at X% technical style", "X% STE100", "X% standard". The phrase "engineering style" is accepted as an alias for "technical style". If the user says "technical style", "engineering style", "STE100", or "the standard" with no number, use `p = 100`. If they say "normal" or "your usual way", use `p = 0`. Do NOT apply the dial when a percentage refers to length, brevity, or conciseness — e.g. "make this 50% shorter", "write at 50% conciseness". Treat those as ordinary requests. If the setting is genuinely ambiguous, ask before applying the dial.
2. If `p = 100`, follow `ste100-rules.md` (in this folder) strictly: controlled vocabulary, sentence-length limits, one topic per sentence, active voice, imperative procedures, no phrasal verbs or gerund nouns, every symbol defined before first use with SI units.
3. If `p = 0`, write naturally with no STE constraints. The standing rule still applies: define every symbol before its first use, with SI units where applicable.
4. If `0 < p < 100`, keep the STE skeleton — clear sections, terms and symbols defined up front, imperative steps, short sentences — and add natural explanatory passages (rationale, transitions, physical intuition) in roughly `(100 − p)`% of the text. Higher `p` means fewer and shorter asides; lower `p` means more flowing prose, but keep terminology consistent and defined.
5. State the percentage used in one short line before or after the piece, e.g. "Written at 70% technical style."

## Output Contract
- The drafted or rewritten text at the requested dial setting.
- Equations in plain text in chat (never LaTeX delimiters in a chat reply); for math-heavy deliverables, build the self-contained HTML file per the user's standing preference instead.
- One line noting the percentage applied.

## Operating Rules
1. The dial controls style only. It never changes technical content, and it never relaxes correctness.
2. The symbol-definition rule (every symbol defined at or before first use, SI units where applicable) applies at every setting, including 0%.
3. Hold the chosen percentage steady through the whole piece. Do not drift between styles mid-document unless the user asks.
4. Do not invent STE rules beyond `ste100-rules.md` (in this folder). When in doubt at high `p`, prefer the simpler, shorter, more explicit phrasing.
