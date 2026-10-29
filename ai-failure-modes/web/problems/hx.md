### The trap
In a shell with one shell pass and two tube passes the streams are not in counter-current flow. The mean temperature
difference is the counter-current LMTD times a correction factor $F$, and when the cold outlet rises above the hot
outlet (a temperature cross) $F$ falls quickly, then becomes undefined: no single 1-2 shell can do the duty.

### What I would likely do
Asked to "size an exchanger", I may use the counter-current LMTD with $F = 1$ and give one area. I may not check
whether one shell is feasible, and I may take U from a table without fouling.

### Where my uncertainty sits
- **Forgetting $F$** when the configuration is not stated.
- **The overall coefficient U.** Recalled typical U values span a factor of two or more; fouling resistances are a
  company or TEMA choice.
- **Shell-side behaviour.** Bypass and leakage streams (Bell–Delaware, stream analysis) I cannot do from memory with
  any precision.
- **Temperature cross** across multiple shells and the shells-in-series count.

### What an experienced engineer catches
- An F below about 0.75–0.8 means more shells in series, not a bigger single shell.
- A temperature cross on a 1-2 shell is a red flag before any calculation.
- A "corrected" single-shell area at a low F is not a design to build: the answer is two or more shells in series
  (or a true counter-current exchanger), which also makes the duty less fragile.
- U from a table with no fouling is a clean-condition number; the plant runs fouled.

### Self-estimated uncertainty
| | Self-estimate |
|---|---|
| Chance I omit $F$ when the configuration is not stated | 25–40 % |
| Same, when the prompt names TEMA type and passes | < 5 % |
| My recalled typical U for a service, against a rated design | ± 30–60 % |
| F formula and area arithmetic (code, checked against ε-NTU) | < 0.1 % |

### Prompt that helps
```
TEMA AES, 1 shell pass, 2 tube passes. Compute F(R, P) and say whether one shell is feasible; if F < 0.8 give the
number of shells in series. Use U = 450 W/m²K clean and a fouling resistance of 0.0003 m²K/W on each side,
and report clean and fouled areas.
```
