### The trap
Ethanol and water form a minimum-boiling azeotrope. Raoult's law (ideal solution) predicts a relative volatility well
above 1 all the way to pure ethanol, so it "shows" that ordinary distillation can reach anhydrous ethanol. It
cannot. Above the azeotrope the true relative volatility is below 1.

### What I would likely do
For ethanol–water I know the azeotrope exists. For a less famous binary, or a quick "estimate relative
volatility" question, I may default to Raoult's law. I may also quote activity-model parameters from memory.

### Where my uncertainty sits
- **Binary interaction parameters from memory.** The van Laar constants here are recalled values; I can only check
  them against the azeotrope they predict. On this page they put it at about **[[azeo_x]] mol % ethanol and
  [[azeo_T]] °C** at 1 atm. The figure usually quoted is near 89 mol % and 78.2 °C (from my memory, not verified
  here): a drift of this size is typical of recalled parameters.
- **Which model and fit range.** Wilson, NRTL, UNIQUAC and van Laar fit data well near their source data and less
  well outside it. I do not know which data set your simulator uses.
- **Pressure dependence.** Azeotropes shift with pressure; parameters fitted at 1 atm may not hold under vacuum.
- **Unknown or reactive components.** For new mixtures I would be guessing.

### What an experienced engineer catches
- The tray count from an ideal-model McCabe–Thiele near the top of the column is far too low.
- Low relative volatility near the azeotrope makes tray efficiency and reflux decisions very sensitive.
- They ask where the parameters came from (DECHEMA, regressed plant data) before trusting any design.

### Self-estimated uncertainty
| | Self-estimate |
|---|---|
| Chance I use an ideal model for a non-ideal binary in a quick answer | 15–30 % |
| Error of recalled activity-coefficient parameters (in $\gamma$ at infinite dilution) | ± 10–30 % |
| Error in an azeotrope composition predicted from recalled parameters | ± 1–3 mol % |
| Same with parameters you supply from a data bank | small; then the model choice dominates |

### Prompt that helps
```
Treat this mixture as non-ideal. Use NRTL with parameters I give below (or say clearly that you are recalling
them and from which source). Plot y–x at 1.013 bar and at 0.3 bar, mark any azeotrope, and compare its
predicted composition and temperature with experimental data you can cite. Flag where the relative volatility
falls below 1.2.
```
