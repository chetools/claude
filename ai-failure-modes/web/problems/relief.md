### The trap
In a fire, the relief load is heat input divided by the latent heat **at relieving conditions**. For propane at a
typical relieving pressure, the latent heat is much lower than at its normal boiling point, so a "handbook" latent
heat underestimates the vapour rate. The vapour is also far from ideal at those conditions.

### What I would likely do
I know the API 521 heat-input formula and the API 520 vapour-sizing equation. I may take a latent heat from memory
without fixing the pressure, set Z = 1, and present a single area as if the scenario were settled.

### Where my uncertainty sits
- **Scenario selection.** Fire, blocked outlet, control-valve failure, tube rupture, runaway: picking the governing
  case needs the plant, and I cannot see it. This is the largest uncertainty, and the one I cannot reduce.
- **Wetted area.** Only the area within 25 ft (7.6 m) of grade or another fire-supporting surface counts; I depend on
  your geometry.
- **Properties at relief.** Latent heat and Z at relieving pressure; near the critical point the latent-heat method
  breaks down.
- **Code edition and local rules.** API editions and company standards change constants and allowed overpressure.

### What an experienced engineer catches
- "Which scenario governs, and who signed it off?"
- Inlet line pressure loss (the 3 % rule) and built-up back pressure on the outlet.
- Built-up back pressure ($K_b$) and an upstream rupture disc ($K_c$) are not in this calculation.
- A relief valve does not protect the unwetted, overheated shell wall; depressuring per API 521 may be needed.
- The area decides the orifice letter (API 526); a small area increase can move the selection up a letter.
- An oversized valve chatters; a single area without a scenario list is not a relief design.

### Self-estimated uncertainty
| | Self-estimate |
|---|---|
| Chance I use latent heat at the wrong pressure, or Z = 1, unprompted | 30–50 % |
| Chance I choose or imply the governing scenario wrongly | not estimable by me; needs the plant |
| My recalled latent heat of a hydrocarbon at a given pressure | ± 10–30 % |
| Area arithmetic once properties are fixed (code) | < 1 % |

This page is a teaching illustration, not a relief design. Relief systems must be designed and checked by
qualified engineers to the applicable codes.

### Prompt that helps
```
Fire case only, API 521 / API 520 (state the editions you assume). Wetted area: give it from this geometry, counting
only up to 7.6 m above grade. Get latent heat, Z and k of the vapour at the relieving pressure from a named EOS,
not from memory. List the other scenarios that could govern and the data you would need to rule each out.
```
