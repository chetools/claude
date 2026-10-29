### The trap
Near its critical point (31 °C, 73.8 bar) CO2 is neither a gas nor a liquid, and the ideal-gas law can be off by
more than half. A cubic equation of state is far better but still has its largest errors exactly where pipelines and
injection systems operate.

### What I would likely do
For CO2 at high pressure I would use an equation of state. I might, however, treat Peng–Robinson as accurate
everywhere and not warn about its error near the critical point, and I would usually assume pure CO2.

### Where my uncertainty sits
- **Cubic EOS near the critical point.** The table below (computed at build time against the Span–Wagner
  reference equation, via CoolProp) shows where Peng–Robinson errs most.
- **Impurities.** N2, O2, H2, Ar and H2S in captured CO2 move the phase envelope and the density; I do not know your
  composition.
- **Phase at a given state.** Close to the saturation line I can put a state on the wrong side.

[[co2_table]]

### What an experienced engineer catches
- Density errors near the critical point feed straight into line pack, pump/compressor sizing and metering.
- Depressurisation of dense CO2 drops the temperature sharply (dry ice, brittle fracture of carbon steel).
- They specify the reference EOS (Span–Wagner for pure CO2, GERG-2008 for mixtures) in the design basis.

### Self-estimated uncertainty
| | Self-estimate |
|---|---|
| Chance I use the ideal-gas law here | < 5 % |
| Chance I present a cubic EOS result without its near-critical error | 30–50 % |
| My recalled density of CO2 at a given state, without computing | ± 5–20 % near the critical point |
| Peng–Robinson error vs reference | see the table (computed) |

### Prompt that helps
```
Compute CO2 density with the Span–Wagner EOS (CoolProp or REFPROP) and with Peng–Robinson, and report the
difference. The stream contains 2 mol % N2 and 0.5 mol % H2. Say which phase each state is in, and how close it is
to the phase boundary.
```
