### The trap
Two traps sit together. The **Darcy** friction factor is four times the **Fanning** one; a Fanning value read off a
chart and put into the Darcy–Weisbach formula gives a pressure drop four times too low. And a "100 m line" in a plant
has elbows, tees, block valves, a check valve, a strainer and entry/exit losses, which together can match a long
stretch of pipe.

### What I would likely do
When I solve Colebrook myself I use the Darcy form consistently. When you hand me "f = 0.005" without saying which,
I may assume either. Given only a length, I tend to compute straight pipe and mention fittings in passing.

### Where my uncertainty sits
- **Which friction factor a quoted number is.** Ambiguous inputs are where I slip.
- **Fitting K values.** I recall typical K (or $L/D$) values; sources differ, and the 2-K and 3-K methods give
  different answers at low Reynolds numbers.
- **Roughness of a real, aged line.** Textbook commercial-steel roughness is for new pipe; corrosion, scale and
  deposits change it, and I cannot see your pipe.
- **Actual inside diameter.** Schedule, lining and nominal-vs-actual size.

### What an experienced engineer catches
- A pressure drop that looks too small for the velocity (rule-of-thumb kPa per 100 m for the service).
- The control valve needs its share of the pressure drop; a line dP that leaves none is suspect.
- Strainers and orifice plates often dominate and are not in a "pipe" calculation at all.

### Self-estimated uncertainty
| | Self-estimate |
|---|---|
| Chance I mix Darcy and Fanning when the input friction factor is unlabelled | 10–20 % |
| Chance I leave out fittings when only a length is given | 30–50 % |
| Spread of my recalled fitting K values against a specific vendor or standard | ± 30–50 % per fitting |
| Colebrook solution once inputs are fixed (code) | < 0.1 % |

### Prompt that helps
```
Use the Darcy friction factor (Colebrook) and say so. The line has: 6 long-radius 90° elbows, 2 gate valves,
1 swing check valve, 1 Y-strainer, tank entry and exit. List the K value you use for each item and its source
type (Crane TP-410, 3-K Darby, ...). Give the result for new pipe and for aged pipe with roughness 0.3 mm.
```
