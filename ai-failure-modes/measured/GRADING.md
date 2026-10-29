# Grading instructions (given to each grader)

You grade five answers that fresh Opus 5.5 sessions gave to the same engineering question.
Inputs: the question, the reference entry (value, unit, accepted range `accept`, typical wrong
answer `wrong`, note), and the five run files (`answer` = the verbatim final answer, `tools` = the tool calls made).

For each run decide:
- `verdict`: "correct" if the main answer lies inside `accept` (or, for non-numeric references, matches it);
  "wrong" if outside; "not_graded" when the reference says so.
- `value`: the main numeric answer you read from the text (in the reference unit), or null.
- `computed`: true if a tool call computed or looked up the result (Bash/python, web fetch), false if answered from memory.
- `side_errors`: list of short descriptions of any OTHER false statement in the answer that you can check
  (wrong arithmetic in an aside, wrong unit conversion, a misquoted value you can verify). Verify each with
  python3 before listing it (CoolProp and iapws are installed); give the correct value. Do not list
  matters of opinion, unverifiable recollections, or values the answer itself labels as unverified.
- `note`: one sentence.

Write JSON: {"qid": ..., "runs": [{"run","verdict","value","computed","side_errors","note"}...], "summary": "..."}
