### The trap
A compression ratio is a ratio of **absolute** pressures. "5 to 100 psi" read as 5 psig to 100 psig is a ratio of
about 5.8, not 20. The same slip appears in staging, in ideal-gas densities, and in any formula with $P_2/P_1$.

### What I would likely do
If the units say `psig` or `barg`, I usually convert correctly. If they say `psi`, `bar` or `kg/cm²` with no
suffix, I pick a convention silently, and I may pick a different one from the one used on your P&ID. I also tend to
report the *isentropic* discharge temperature as if it were the real one.

### Where my uncertainty sits
- **Gauge or absolute when unstated.** I have no way to know which your plant means; I guess.
- **Isentropic vs actual.** A real machine with an isentropic efficiency below 1 runs hotter than this; I may leave
  the efficiency out unless asked.
- **k for real gases.** I recall $c_p/c_v$ for common gases from memory; for mixtures and at high pressure it drifts.
- **Site atmospheric pressure.** Altitude plants are not at 14.7 psia.

### What an experienced engineer catches
- "Is that gauge?" is the first question at any design review.
- Discharge temperature limits (seal, lube oil, polymerisation, trip setting) set the number of stages, so a
  wrong ratio changes the machine, not just a number.
- The isentropic temperature is a lower bound; the case details show the actual value for an assumed efficiency.
- Suction pressure in a gauge reading near zero makes a gauge ratio explode; that is a giveaway.

### Self-estimated uncertainty
| | Self-estimate |
|---|---|
| Chance I use the wrong pressure basis when the units are ambiguous | 20–35 % |
| Same, when the prompt states gauge or absolute explicitly | < 3 % |
| Arithmetic error once the setup is right (when I run code) | < 0.5 % |
| Real discharge temperature vs the isentropic estimate | I would not quote it without an efficiency |

### Prompt that helps
```
All pressures below are GAUGE unless marked "a". Site atmospheric pressure is 14.2 psia.
Before computing, restate each pressure in absolute units and show the ratio.
Report the isentropic and the actual discharge temperature for an isentropic efficiency of 0.75,
and say whether a single stage is acceptable for a 150 °C discharge limit.
```
