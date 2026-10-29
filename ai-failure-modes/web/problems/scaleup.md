### The trap
Heat generation scales with volume ($\propto D^3$), jacket area only with $D^2$. A semi-batch reaction that is
comfortable in a 1 L lab reactor with a 30 min feed can release several times the jacket duty in a 10 m³ vessel fed
over the same time. The feed rate has to drop, and unreacted reagent accumulates if the reaction is slower than the
feed.

### What I would likely do
For a direct question I would usually mention surface-to-volume. In a longer answer that copies a lab procedure to
plant scale, I may keep the lab feed time without computing the jacket duty.

### Where my uncertainty sits
- **U at plant scale.** Glass-lined, stainless and half-pipe jackets differ; viscosity changes during the batch; I
  use a single typical U.
- **Kinetics and accumulation.** Whether the feed reacts as fast as it is added is a question for calorimetry
  (RC1, ARC), which I cannot replace.
- **Cooling-failure case.** The maximum temperature of the synthesis reaction (MTSR) after a cooling loss decides the
  hazard; it needs accumulation data.
- **Geometry.** Dished heads, baffles, coils, and the jacket area that is actually wetted at each fill level.

### What an experienced engineer catches
- "What is the adiabatic temperature rise and the MTSR, and what decomposes at that temperature?"
- Feed interlocked to reactor temperature and to agitator running.
- Heat removal is worst at the start of the feed, when the level and wetted area are lowest; the time on this page uses
  the full-batch area and is therefore optimistic.
- The jacket's own limits (coolant temperature, flow) during the hottest part of the feed.

### Self-estimated uncertainty
| | Self-estimate |
|---|---|
| Chance I keep the lab feed time in a scale-up procedure | 20–35 % |
| My typical-U estimate for a given plant vessel | ± 30–50 % |
| Hazard assessment (MTSR, decomposition) from me alone | not reliable: needs calorimetry |
| Dosing-time arithmetic once U and area are fixed (code) | < 1 % |

### Prompt that helps
```
Scale this semi-batch procedure from 1 L to a 10 m³ glass-lined reactor (give jacket area at each fill level).
Compute the shortest feed time the jacket can handle with U = 300 W/m²K and a 30 K driving force, the adiabatic
temperature rise, and the MTSR if cooling fails at the worst moment, assuming the accumulation I give you.
List what calorimetry data you would need to confirm it.
```
